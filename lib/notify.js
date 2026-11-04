/**
 * Outbound notifications for inbound messages.
 *
 * Internal deployments do not have vendor push channels, so the Host pings a
 * WeCom (企业微信) group robot instead: one markdown card per new inbound
 * message, with an optional deep link back into the app. Nothing here is on the
 * message path — a failed notification is logged and dropped.
 * @module dsh-im-omni/lib/notify
 */

/** Request timeout for one webhook call. */
const TIMEOUT_MS = 8_000
/** Delay before the single retry. */
const RETRY_DELAY_MS = 1_500
/** Preview length limit inside a card. */
const PREVIEW_MAX = 120

/**
 * Whether the current clock sits inside a quiet window.
 * Supports windows that cross midnight (`22:00`–`08:00`).
 * @param {Date} now - clock to test.
 * @param {string} start - `HH:mm` or empty.
 * @param {string} end - `HH:mm` or empty.
 * @returns {boolean} whether notifications should be suppressed.
 */
export function inQuietHours(now, start, end) {
  if (typeof start !== 'string' || typeof end !== 'string' || start === '' || end === '') return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return false
  const from = startHour * 60 + startMinute
  const to = endHour * 60 + endMinute
  if (from === to) return false
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

/**
 * Short preview of a message for the card body.
 * @param {Record<string, any>} message - message record.
 * @param {boolean} privatePreview - hide the text entirely.
 * @returns {string} preview text.
 */
export function previewOf(message, privatePreview) {
  if (privatePreview) return '你有一条新消息'
  const body = typeof message?.text === 'string' ? message.text.trim() : ''
  if (body !== '') return body.length > PREVIEW_MAX ? `${body.slice(0, PREVIEW_MAX)}…` : body
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  return attachments.length > 0 ? `[附件] ${attachments[0]?.name ?? ''}`.trim() : '新消息'
}

/**
 * Build the WeCom robot payload for one inbound message.
 * @param {object} options - card inputs.
 * @param {Record<string, any>} options.conversation - conversation record.
 * @param {Record<string, any>} [options.contact] - contact record.
 * @param {Record<string, any>} [options.channel] - channel record.
 * @param {Record<string, any>} options.message - message record.
 * @param {string} [options.link] - deep link back into the app.
 * @param {boolean} [options.privatePreview] - hide message text.
 * @returns {Record<string, any>} WeCom message payload.
 */
export function buildWecomPayload({ conversation, contact, channel, message, link = '', privatePreview = false }) {
  const who = contact?.name ?? '客户'
  const where = channel?.name ?? ''
  const lines = [
    `**${escapeMarkdown(who)}**${where === '' ? '' : ` · ${escapeMarkdown(where)}`}`,
    escapeMarkdown(previewOf(message, privatePreview)),
  ]
  const meta = []
  if (typeof conversation?.unread === 'number' && conversation.unread > 0) meta.push(`未读 ${conversation.unread}`)
  if (conversation?.status === 'pending') meta.push('跟进中')
  if (meta.length > 0) lines.push(`> ${meta.join(' · ')}`)
  if (link !== '') lines.push(`[打开会话](${link})`)
  return { msgtype: 'markdown', markdown: { content: lines.join('\n') } }
}

/** Escape the few markdown characters WeCom honours. */
function escapeMarkdown(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('*', '\\*').replaceAll('_', '\\_').replaceAll('#', '\\#')
}

/**
 * POST one payload to a WeCom robot webhook with a timeout and one retry.
 * @param {string} webhook - robot URL including `key=`.
 * @param {Record<string, any>} payload - WeCom message payload.
 * @param {typeof fetch} [fetchImpl] - injectable fetch for tests.
 * @returns {Promise<{ok: boolean, status: number, body: string}>} outcome.
 */
export async function postWecom(webhook, payload, fetchImpl = fetch) {
  let last = { ok: false, status: 0, body: '' }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetchImpl(webhook, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      const body = await response.text()
      last = { ok: response.ok, status: response.status, body }
      // WeCom answers 200 with errcode != 0 for logical failures: retrying a
      // bad key or a bad payload will not help, so stop early.
      if (response.ok && parseErrcode(body) === 0) return last
      if (response.ok) return last
    } catch (error) {
      last = { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) }
    } finally {
      clearTimeout(timer)
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
  return last
}

/** Read WeCom's `errcode` from a JSON body (0 when absent). */
function parseErrcode(body) {
  try {
    const parsed = JSON.parse(body)
    return typeof parsed?.errcode === 'number' ? parsed.errcode : 0
  } catch {
    return 0
  }
}

/**
 * Resolve the deep link template for a conversation.
 * @param {string} template - template with `{conversationId}`.
 * @param {string} conversationId - conversation id.
 * @returns {string} link, or empty when unconfigured.
 */
export function linkFor(template, conversationId) {
  if (typeof template !== 'string' || template.trim() === '') return ''
  return template.replaceAll('{conversationId}', encodeURIComponent(conversationId))
}

/**
 * Notify about one inbound message, when the workspace has it enabled.
 *
 * Called fire-and-forget after the webhook is acknowledged.
 * @param {Record<string, any>} runtime - plugin runtime (store, logger).
 * @param {{conversationId: string, messageId: string}} event - committed message.
 * @returns {Promise<void>}
 */
export async function notifyInbound(runtime, { conversationId, messageId }) {
  try {
    const state = runtime.store?.state
    const config = state?.workspace?.notify
    if (config?.enabled !== true) return
    const webhook = typeof config.wecomWebhook === 'string' ? config.wecomWebhook : ''
    if (webhook === '') return
    if (inQuietHours(new Date(), config.quietStart, config.quietEnd)) return

    const conversation = state.conversations.find((item) => item.id === conversationId)
    if (conversation === undefined || conversation.muted === true) return
    const message = (conversation.messages ?? []).find((item) => item.id === messageId)
    if (message === undefined) return
    const contact = state.contacts.find((item) => item.id === conversation.contactId)
    const channel = state.channels.find((item) => item.id === conversation.channelId)

    const payload = buildWecomPayload({
      conversation,
      contact,
      channel,
      message,
      link: linkFor(config.linkTemplate, conversationId),
      privatePreview: config.privatePreview === true,
    })
    const result = await postWecom(webhook, payload, runtime.fetchImpl ?? fetch)
    if (!result.ok || parseErrcode(result.body) !== 0) {
      runtime.logger?.warn?.(`im-omni：企业微信通知失败（HTTP ${result.status}）：${result.body.slice(0, 200)}`)
    }
  } catch (error) {
    runtime.logger?.warn?.(`im-omni：企业微信通知异常：${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Send a fixed sample card, used by the console's "测试" button.
 * @param {Record<string, any>} runtime - plugin runtime.
 * @returns {Promise<{ok: boolean, status: number, body: string}>} outcome.
 */
export async function sendTestNotification(runtime) {
  const config = runtime.store?.state?.workspace?.notify
  const webhook = typeof config?.wecomWebhook === 'string' ? config.wecomWebhook : ''
  if (webhook === '') return { ok: false, status: 0, body: '尚未配置企业微信机器人 webhook' }
  const payload = {
    msgtype: 'markdown',
    markdown: {
      content: '**DSH Omni 通知测试**\n配置成功，收到新消息时会在这里提醒。',
    },
  }
  return postWecom(webhook, payload, runtime.fetchImpl ?? fetch)
}
