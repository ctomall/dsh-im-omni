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
    const result = await client.query(
      `INSERT INTO tenant_notify (tenant_id, enabled, wecom_webhook, quiet_start, quiet_end, private_preview, updated_at)
       VALUES ($1, COALESCE($2, false), COALESCE($3, ''), COALESCE($4, ''), COALESCE($5, ''), COALESCE($6, false), now())
       ON CONFLICT (tenant_id) DO UPDATE SET
         enabled = COALESCE(EXCLUDED.enabled, tenant_notify.enabled),
         wecom_webhook = CASE WHEN $3 IS NULL AND $7 THEN tenant_notify.wecom_webhook ELSE EXCLUDED.wecom_webhook END,
         quiet_start = CASE WHEN $4 IS NULL THEN tenant_notify.quiet_start ELSE EXCLUDED.quiet_start END,
         quiet_end = CASE WHEN $5 IS NULL THEN tenant_notify.quiet_end ELSE EXCLUDED.quiet_end END,
         private_preview = COALESCE(EXCLUDED.private_preview, tenant_notify.private_preview),
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
  if (inQuietHours(options.now ?? new Date(), settings.quiet_start, settings.quiet_end)) {
    return { skipped: 'quiet-hours' }
  }
  const payload = buildNotifyPayload({ ...input, privatePreview: settings.private_preview })
  const result = await postWecom(settings.wecom_webhook, payload, options.fetchImpl ?? fetch)
  return { ok: result.ok, status: result.status }
}
