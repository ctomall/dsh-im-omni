/**
 * Inbound webhooks: a provider posts a customer message, we land it in the
 * tenant's conversation and bump the unread counter.
 *
 * The URL only carries the channel id, so the tenant is resolved through the
 * `channel_lookup` SECURITY DEFINER function before any tenant transaction.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, withTenant } from './db.mjs'
import { recordUsage } from './usage.mjs'

/** Error carrying an HTTP status. */
export class InboundError extends Error {
  /**
   * @param {number} status - HTTP status.
   * @param {string} code - machine code.
   * @param {string} message - human text.
   */
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Verify an optional HMAC signature against the channel credential.
 * @param {string} secret - shared secret (empty disables checking).
 * @param {string} body - raw request body.
 * @param {string} header - `sha256=<hex>` header value.
 * @returns {boolean} whether the call is authentic.
 */
export function validSignature(secret, body, header) {
  if (secret === '') return true
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const actual = header.slice('sha256='.length)
  const a = Buffer.from(expected)
  const b = Buffer.from(actual)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Land one inbound message.
 * @param {string} channelId - channel uuid from the webhook URL.
 * @param {Record<string, any>} payload - provider payload.
 * @param {{rawBody?: string, signature?: string}} [meta] - signature context.
 * @returns {Promise<{conversationId: string, messageId: string, contactId: string, duplicate: boolean}>} result.
 */
export async function handleInbound(channelId, payload, meta = {}) {
  const channel = await db().query('SELECT * FROM channel_lookup($1)', [channelId])
  if (channel.rowCount === 0) throw new InboundError(404, 'channel-not-found', 'Channel not found.')
  const target = channel.rows[0]
  if (!validSignature(target.credentials ?? '', meta.rawBody ?? '', meta.signature ?? '')) {
    throw new InboundError(401, 'bad-signature', 'Signature mismatch.')
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (text === '') throw new InboundError(422, 'invalid', 'text is required.')
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : ''
  const name = typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name.trim().slice(0, 80) : (phone || '新客户')
  const externalId = typeof payload.externalId === 'string' ? payload.externalId.trim() : ''

  return withTenant(target.tenant_id, async (client) => {
    await client.query('BEGIN')
    try {
      // Idempotency: the provider retries webhooks, so the same external id must
      // not create a second message.
      if (externalId !== '') {
        const seen = await client.query(
          'SELECT id, conversation_id FROM messages WHERE tenant_id = $1 AND client_id = $2 LIMIT 1',
          [target.tenant_id, `in:${externalId}`],
        )
        if (seen.rowCount > 0) {
          await client.query('ROLLBACK')
          return {
            conversationId: seen.rows[0].conversation_id,
            messageId: seen.rows[0].id,
            contactId: '',
            duplicate: true,
          }
        }
      }

      const existingContact = phone === ''
        ? { rowCount: 0, rows: [] }
        : await client.query(
          'SELECT id FROM contacts WHERE tenant_id = $1 AND phone = $2 LIMIT 1',
          [target.tenant_id, phone],
        )
      const contact = existingContact.rowCount > 0
        ? existingContact.rows[0]
        : (await client.query(
          'INSERT INTO contacts (tenant_id, name, phone, hue) VALUES ($1, $2, $3, $4) RETURNING id',
          [target.tenant_id, name, phone, Math.floor(Math.random() * 360)],
        )).rows[0]

      const open = await client.query(
        `SELECT id FROM conversations
          WHERE tenant_id = $1 AND channel_id = $2 AND contact_id = $3 AND status <> 'resolved'
          ORDER BY updated_at DESC LIMIT 1`,
        [target.tenant_id, channelId, contact.id],
      )
      const conversation = open.rowCount > 0
        ? open.rows[0]
        : (await client.query(
          `INSERT INTO conversations (tenant_id, channel_id, contact_id, subject, status, unread, last_inbound_at)
           VALUES ($1, $2, $3, $4, 'open', 0, now()) RETURNING id`,
          [target.tenant_id, channelId, contact.id, text.slice(0, 60)],
        )).rows[0]

      const message = await client.query(
        `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, status, client_id)
         VALUES ($1, $2, 'in', 'text', $3, 'received', $4) RETURNING id`,
        [target.tenant_id, conversation.id, text, externalId === '' ? '' : `in:${externalId}`],
      )
      await client.query(
        `UPDATE conversations
            SET unread = unread + 1, last_inbound_at = now(), updated_at = now(),
                status = CASE WHEN status = 'snoozed' THEN 'open' ELSE status END
          WHERE tenant_id = $1 AND id = $2`,
        [target.tenant_id, conversation.id],
      )
      await recordUsage(client, target.tenant_id, 'message', 1)
      await client.query('COMMIT')
      return {
        conversationId: conversation.id,
        messageId: message.rows[0].id,
        contactId: contact.id,
        duplicate: false,
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  })
}
