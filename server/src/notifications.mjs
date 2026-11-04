/**
 * Tenant notifications for inbound messages.
 *
 * Internal deployments have no push channel, so the server pings a WeCom group
 * robot instead. Sending is fire-and-forget: a notification never blocks or
 * fails an inbound webhook.
 */
import { withTenant } from './db.mjs'

/** Webhook call timeout. */
const TIMEOUT_MS = 8_000

/**
 * Read a tenant's notification settings.
 * @param {string} tenantId - tenant uuid.
 * @returns {Promise<Record<string, any>>} settings row (empty defaults when unset).
 */
export async function notifySettings(tenantId) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query('SELECT * FROM tenant_notify WHERE tenant_id = $1', [tenantId])
    return result.rows[0] ?? {
      tenant_id: tenantId,
      enabled: false,
      wecom_webhook: '',
      quiet_start: '',
      quiet_end: '',
      private_preview: false,
      link_template: '',
    }
  })
}

/**
 * Public view of the settings: the webhook is a credential, so it is redacted.
 * @param {Record<string, any>} row - stored settings.
 * @returns {Record<string, any>} redacted settings.
 */
export function publicNotifySettings(row) {
  return {
    enabled: row.enabled === true,
    configured: typeof row.wecom_webhook === 'string' && row.wecom_webhook !== '',
    wecomWebhook: row.wecom_webhook === '' ? '' : maskWebhook(row.wecom_webhook),
    quietStart: row.quiet_start ?? '',
    quietEnd: row.quiet_end ?? '',
    privatePreview: row.private_preview === true,
    linkTemplate: row.link_template ?? '',
  }
}

/** Keep only the tail of the key so an operator can recognise the robot. */
function maskWebhook(url) {
  return url.replace(/key=([^&]{4})[^&]*/, 'key=$1****')
}

/**
 * Upsert notification settings.
 * @param {string} tenantId - tenant uuid.
 * @param {Record<string, any>} input - partial settings.
 * @returns {Promise<Record<string, any>>} stored row.
 */
export async function saveNotifySettings(tenantId, input) {
  return withTenant(tenantId, async (client) => {
    const webhook = typeof input.wecomWebhook === 'string' ? input.wecomWebhook.trim() : undefined
    if (webhook !== undefined && webhook !== '' && !/^https:\/\//i.test(webhook)) {
      throw Object.assign(new Error('企业微信机器人地址必须以 https:// 开头。'), { status: 422, code: 'invalid-webhook' })
    }
    const linkTemplate = typeof input.linkTemplate === 'string' ? input.linkTemplate.trim() : undefined
    const result = await client.query(
      `INSERT INTO tenant_notify (tenant_id, enabled, wecom_webhook, quiet_start, quiet_end, private_preview, link_template, updated_at)
       VALUES ($1, COALESCE($2, false), COALESCE($3, ''), COALESCE($4, ''), COALESCE($5, ''), COALESCE($6, false), COALESCE($8, ''), now())
       ON CONFLICT (tenant_id) DO UPDATE SET
         enabled = COALESCE(EXCLUDED.enabled, tenant_notify.enabled),
         wecom_webhook = CASE WHEN $3 IS NULL AND $7 THEN tenant_notify.wecom_webhook ELSE EXCLUDED.wecom_webhook END,
         quiet_start = CASE WHEN $4 IS NULL THEN tenant_notify.quiet_start ELSE EXCLUDED.quiet_start END,
         quiet_end = CASE WHEN $5 IS NULL THEN tenant_notify.quiet_end ELSE EXCLUDED.quiet_end END,
         private_preview = COALESCE(EXCLUDED.private_preview, tenant_notify.private_preview),
         link_template = CASE WHEN $8 IS NULL THEN tenant_notify.link_template ELSE EXCLUDED.link_template END,
         updated_at = now()
       RETURNING *`,
      [
        tenantId,
        typeof input.enabled === 'boolean' ? input.enabled : null,
        webhook === undefined ? null : webhook,
        typeof input.quietStart === 'string' ? input.quietStart : null,
        typeof input.quietEnd === 'string' ? input.quietEnd : null,
        typeof input.privatePreview === 'boolean' ? input.privatePreview : null,
        webhook === undefined,
        linkTemplate === undefined ? null : linkTemplate,
      ],
    )
    return result.rows[0]
  })
}

/**
 * Whether the current clock sits in the quiet window (supports past midnight).
 * @param {Date} now - clock.
 * @param {string} start - `HH:mm` or empty.
 * @param {string} end - `HH:mm` or empty.
 * @returns {boolean} whether notifications are suppressed.
 */
export function inQuietHours(now, start, end) {
  if (!start || !end) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (![sh, sm, eh, em].every(Number.isFinite)) return false
  const from = sh * 60 + sm
  const to = eh * 60 + em
  if (from === to) return false
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

/**
 * Build the WeCom markdown card for one inbound message.
 * @param {{contactName?: string, channelName?: string, text: string, unread?: number, privatePreview?: boolean}} input - card inputs.
 * @returns {Record<string, any>} WeCom payload.
 */
export function buildNotifyPayload(input) {
  const preview = input.privatePreview
    ? '你有一条新消息'
    : (input.text.length > 120 ? `${input.text.slice(0, 120)}…` : input.text)
  const header = [input.contactName ?? '客户', input.channelName].filter(Boolean).join(' · ')
  const lines = [`**${header}**`.trim(), preview]
  if (typeof input.unread === 'number' && input.unread > 0) lines.push(`> 未读 ${input.unread}`)
  if (typeof input.extra === 'number' && input.extra > 0) lines.push(`> 另有 ${input.extra} 条新消息`)
  if (typeof input.link === 'string' && input.link !== '') lines.push(`[打开会话](${input.link})`)
  return { msgtype: 'markdown', markdown: { content: lines.join('\n') } }
}

/**
 * POST a payload to a WeCom robot.
 * @param {string} webhook - robot URL.
 * @param {Record<string, any>} payload - message payload.
 * @param {typeof fetch} [fetchImpl] - injectable fetch.
 * @returns {Promise<{ok: boolean, status: number, body: string}>} outcome.
 */
export async function postWecom(webhook, payload, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Notify about one inbound message, when the tenant enabled it.
 * @param {string} tenantId - tenant uuid.
 * @param {{contactName?: string, channelName?: string, text: string, unread?: number}} input - card inputs.
 * @param {{fetchImpl?: typeof fetch, now?: Date}} [options] - injectables.
 * @returns {Promise<{skipped: string} | {ok: boolean, status: number}>} outcome.
 */
export async function notifyInbound(tenantId, input, options = {}) {
  const settings = await notifySettings(tenantId)
  if (settings.enabled !== true) return { skipped: 'disabled' }
  if (!settings.wecom_webhook) return { skipped: 'no-webhook' }
  const now = options.now ?? new Date()
  if (inQuietHours(now, settings.quiet_start, settings.quiet_end)) {
    return { skipped: 'quiet-hours' }
  }

  const conversationId = input.conversationId ?? ''
  if (conversationId === '') return { skipped: 'no-conversation' }

  // A muted conversation never rings; the message still lands in the inbox.
  const muted = await withTenant(tenantId, async (client) => {
    const row = await client.query(
      'SELECT muted FROM conversations WHERE tenant_id = $1 AND id = $2',
      [tenantId, conversationId],
    )
    return row.rows[0]?.muted === true
  })
  if (muted) return { skipped: 'muted' }

  // Aggregation: at most one card per conversation per 60 seconds. Messages that
  // arrive inside the window bump a counter instead of pinging again.
  const windowMs = Number(options.windowMs ?? 60_000)
  const aggregated = await withTenant(tenantId, async (client) => {
    const existing = await client.query(
      'SELECT last_sent_at, suppressed FROM notify_log WHERE tenant_id = $1 AND conversation_id = $2',
      [tenantId, conversationId],
    )
    if (existing.rowCount > 0) {
      const last = new Date(existing.rows[0].last_sent_at).getTime()
      if (now.getTime() - last < windowMs) {
        await client.query(
          'UPDATE notify_log SET suppressed = suppressed + 1 WHERE tenant_id = $1 AND conversation_id = $2',
          [tenantId, conversationId],
        )
        return true
      }
      const suppressed = Number(existing.rows[0].suppressed ?? 0)
      await client.query(
        'UPDATE notify_log SET last_sent_at = $3, suppressed = 0 WHERE tenant_id = $1 AND conversation_id = $2',
        [tenantId, conversationId, now],
      )
      return { suppressed }
    }
    await client.query(
      'INSERT INTO notify_log (tenant_id, conversation_id, last_sent_at) VALUES ($1, $2, $3)',
      [tenantId, conversationId, now],
    )
    return false
  })
  if (aggregated === true) return { skipped: 'aggregated' }
  const extra = typeof aggregated === 'object' && aggregated !== null ? aggregated.suppressed : 0
  const link = typeof settings.link_template === 'string' && settings.link_template !== ''
    ? settings.link_template.replaceAll('{conversationId}', encodeURIComponent(input.conversationId ?? ''))
    : ''
  const payload = buildNotifyPayload({ ...input, privatePreview: settings.private_preview, link, extra })
  const result = await postWecom(settings.wecom_webhook, payload, options.fetchImpl ?? fetch)
  return { ok: result.ok, status: result.status }
}

/**
 * Send a fixed test card, bypassing aggregation and mute.
 * @param {string} tenantId - tenant uuid.
 * @param {typeof fetch} [fetchImpl] - injectable fetch.
 * @returns {Promise<{skipped?: string, ok?: boolean, status?: number}>} outcome.
 */
export async function sendTestCard(tenantId, fetchImpl = fetch) {
  const settings = await notifySettings(tenantId)
  if (settings.enabled !== true) return { skipped: 'disabled' }
  if (!settings.wecom_webhook) return { skipped: 'no-webhook' }
  const payload = buildNotifyPayload({
    contactName: '测试',
    channelName: 'DSH Omni',
    text: '通知测试：配置成功，收到新消息时会在这里提醒。',
    unread: 1,
    privatePreview: settings.private_preview,
  })
  const result = await postWecom(settings.wecom_webhook, payload, fetchImpl)
  return { ok: result.ok, status: result.status, body: result.body }
}
