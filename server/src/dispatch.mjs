/**
 * Outbound delivery worker.
 *
 * A message is stored as `queued` by the API; this worker posts it to the
 * channel's `outboundUrl` (the provider bridge) and moves it to `sent`, or
 * retries with backoff and finally marks it `failed`.
 *
 * The worker needs to see every tenant, so it connects with a role that
 * bypasses RLS (`DISPATCH_DATABASE_URL`, owner in development). That privilege
 * is confined to delivery: it never serves a request.
 */
import { createHmac } from 'node:crypto'
import pg from 'pg'
import { sendWhatsapp } from './channels/whatsapp.mjs'

/** Attempts before a message is parked as failed. */
const MAX_ATTEMPTS = 3
/** How far a channel without a bridge is pushed back. */
const NO_BRIDGE_BACKOFF_MS = 5 * 60_000

/** @type {pg.Pool | null} */
let pool = null

/** @returns {pg.Pool} worker pool. */
function workerPool() {
  if (pool === null) {
    pool = new pg.Pool({
      connectionString: process.env.DISPATCH_DATABASE_URL
        ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev',
      max: 4,
    })
  }
  return pool
}

/** Release the worker pool (tests). */
export async function closeDispatch() {
  if (pool !== null) {
    await pool.end()
    pool = null
  }
}

/**
 * Deliver one batch of queued messages.
 * @param {{fetchImpl?: typeof fetch, limit?: number, now?: Date}} [options] - injectables.
 * @returns {Promise<{sent: number, failed: number, skipped: number}>} counters.
 */
export async function dispatchOnce(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const limit = options.limit ?? 10
  const now = options.now ?? new Date()
  const client = await workerPool().connect()
  const counters = { sent: 0, failed: 0, skipped: 0 }
  try {
    const pending = await client.query(
      `SELECT m.id, m.tenant_id, m.conversation_id, m.body, m.attempts,
              c.id AS channel_id, c.type AS channel_type, c.config, c.credentials,
              conv.contact_id, ct.phone AS contact_phone
         FROM messages m
         JOIN conversations conv ON conv.id = m.conversation_id
         JOIN channels c ON c.id = conv.channel_id
         JOIN contacts ct ON ct.id = conv.contact_id
        WHERE m.status = 'queued'
          AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= $1)
        ORDER BY m.created_at
        LIMIT $2`,
      [now, limit],
    )
    for (const row of pending.rows) {
      // WhatsApp Cloud talks to Graph directly; every other channel uses the
      // generic outbound bridge URL.
      if (row.channel_type === 'whatsapp_cloud') {
        const result = await sendWhatsapp(
          { config: row.config ?? {}, credentials: row.credentials ?? '' },
          { body: row.body, contactPhone: row.contact_phone ?? '' },
          fetchImpl,
        )
        const attempts = row.attempts + 1
        if (result.ok) {
          await client.query("UPDATE messages SET status = 'sent', attempts = $2, error = '' WHERE id = $1", [row.id, attempts])
          counters.sent += 1
          continue
        }
        const failed = attempts >= MAX_ATTEMPTS
        const backoffMs = Math.min(2 ** attempts * 1000, 60_000)
        await client.query(
          `UPDATE messages SET attempts = $2, status = $3, error = $4, next_attempt_at = $5 WHERE id = $1`,
          [row.id, attempts, failed ? 'failed' : 'queued', result.body.slice(0, 300), new Date(now.getTime() + backoffMs)],
        )
        if (failed) counters.failed += 1
        continue
      }
      const bridge = typeof row.config?.outboundUrl === 'string' ? row.config.outboundUrl : ''
      if (bridge === '') {
        // No bridge configured: keep the message queued but stop polling it hot.
        await client.query('UPDATE messages SET next_attempt_at = $2 WHERE id = $1', [
          row.id,
          new Date(now.getTime() + NO_BRIDGE_BACKOFF_MS),
        ])
        counters.skipped += 1
        continue
      }
      const payload = JSON.stringify({
        messageId: row.id,
        tenantId: row.tenant_id,
        conversationId: row.conversation_id,
        channelId: row.channel_id,
        text: row.body,
        direction: 'out',
      })
      const headers = { 'content-type': 'application/json' }
      const secret = typeof row.credentials === 'string' ? row.credentials : ''
      if (secret !== '') {
        headers['x-dsh-signature'] = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
      }
      let ok = false
      let detail = ''
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10_000)
        try {
          const response = await fetchImpl(bridge, { method: 'POST', headers, body: payload, signal: controller.signal })
          ok = response.ok
          detail = ok ? '' : `HTTP ${response.status}`
        } finally {
          clearTimeout(timer)
        }
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error)
      }
      const attempts = row.attempts + 1
      if (ok) {
        await client.query("UPDATE messages SET status = 'sent', attempts = $2, error = '' WHERE id = $1", [row.id, attempts])
        counters.sent += 1
        continue
      }
      const failed = attempts >= MAX_ATTEMPTS
      const backoffMs = Math.min(2 ** attempts * 1000, 60_000)
      await client.query(
        `UPDATE messages
            SET attempts = $2, status = $3, error = $4, next_attempt_at = $5
          WHERE id = $1`,
        [row.id, attempts, failed ? 'failed' : 'queued', detail.slice(0, 300), new Date(now.getTime() + backoffMs)],
      )
      if (failed) counters.failed += 1
    }
    return counters
  } finally {
    client.release()
  }
}

/**
 * Start the periodic worker.
 * @param {number} [intervalMs] - tick interval.
 * @returns {() => void} stop function.
 */
export function startDispatcher(intervalMs = Number(process.env.DISPATCH_INTERVAL_MS ?? 3000)) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return () => {}
  let busy = false
  const timer = setInterval(() => {
    if (busy) return
    busy = true
    dispatchOnce()
      .catch((error) => console.error('dispatch failed:', error.message))
      .finally(() => {
        busy = false
      })
  }, intervalMs)
  return () => clearInterval(timer)
}
