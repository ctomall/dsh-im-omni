/**
 * QR-login bridge adapter for WhatsApp and WeChat personal accounts.
 *
 * The bridge owns the proprietary session. DSH only asks for a QR, reads
 * status, sends text, and accepts authenticated inbound events.
 * @module dsh-im-omni/lib/channels/qr-bridge
 */
import { text } from '../util.js'
import { authenticateBridge, inboundPayload, pickObject, pickString } from './common.js'
import { joinUrl, requestJson } from './http.js'

/**
 * Build bridge headers.
 * @param {Record<string, any>} channel - channel.
 * @returns {Record<string,string>} headers.
 */
function bridgeHeaders(channel) {
  return { authorization: `Bearer ${text(channel.config?.bridgeToken, 500)}` }
}

/**
 * Call one bridge endpoint.
 * @param {Record<string, any>} channel - channel.
 * @param {string} path - bridge path.
 * @param {{method?:string,body?:unknown,timeout?:number}} [options] - options.
 * @returns {Promise<ReturnType<typeof requestJson> extends Promise<infer T> ? T : never>} result.
 */
async function bridgeCall(channel, path, options = {}) {
  const root = text(channel.config?.bridgeUrl, 2000)
  if (root === '') {
    return { ok: false, status: 0, data: null, text: '', error: 'Bridge URL is not configured.' }
  }
  return requestJson(joinUrl(root, path), {
    method: options.method ?? 'GET',
    headers: bridgeHeaders(channel),
    body: options.body,
    timeout: options.timeout ?? 10_000,
  })
}

/**
 * Extract a safe QR image data URL from a bridge response.
 * @param {unknown} value - candidate.
 * @returns {string} data URL or empty.
 */
function qrImage(value) {
  const raw = text(value, 1_000_000)
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw) ? raw : ''
}

/**
 * Normalize one bridge status payload.
 * @param {Record<string, any>} data - bridge response data.
 * @returns {Record<string, any>} normalized status.
 */
function normalizeStatus(data) {
  const raw = text(data?.status ?? data?.state, 40).toLowerCase()
  const allowed = new Set(['waiting', 'scanning', 'connected', 'disconnected', 'starting', 'error'])
  return {
    status: allowed.has(raw) ? raw : 'disconnected',
    account: text(data?.account ?? data?.displayName ?? data?.phone, 120),
    detail: text(data?.detail ?? data?.message ?? data?.error, 500),
    qrDataUrl: qrImage(data?.qrDataUrl ?? data?.qr),
    updatedAt: text(data?.updatedAt, 40),
  }
}

/**
 * Read the current session state.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<Record<string, any>>} status.
 */
export async function status(channel) {
  const session = text(channel.config?.sessionName, 80) || 'default'
  const result = await bridgeCall(channel, `/session/status?session=${encodeURIComponent(session)}`)
  if (!result.ok) {
    return { ok: false, status: 'disconnected', account: '', detail: result.error, qrDataUrl: '', updatedAt: '' }
  }
  return { ok: true, ...normalizeStatus(result.data), raw: undefined }
}

/**
 * Start (or reuse) a session and fetch a QR.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<Record<string, any>>} QR/status.
 */
export async function qr(channel) {
  const session = text(channel.config?.sessionName, 80) || 'default'
  const start = await bridgeCall(channel, '/session/start', {
    method: 'POST',
    body: { session, channelId: channel.id },
    timeout: 20_000,
  })
  if (start.ok) {
    const started = normalizeStatus(start.data)
    if (started.qrDataUrl !== '' || started.status === 'connected') return { ok: true, ...started }
  }
  const current = await status(channel)
  if (!current.ok) return current
  if (current.qrDataUrl !== '' || current.status === 'connected') return current
  const qrResult = await bridgeCall(channel, `/session/qr?session=${encodeURIComponent(session)}`)
  if (!qrResult.ok) return { ...current, ok: false, detail: qrResult.error }
  return { ok: true, ...normalizeStatus({ ...qrResult.data, status: qrResult.data?.status ?? current.status }) }
}

/**
 * Handle an inbound bridge event.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,url:URL,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  if (!authenticateBridge(channel, request)) return { status: 401, body: 'invalid bridge token' }
  let body
  try {
    body = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  if (body?.event === 'message.created' || body?.message !== undefined) {
    return { status: 202, body: { ok: true }, events: [body] }
  }
  const message = pickObject(body, ['message'])
  const from = pickString(body, ['from', 'id']) || pickString(message, ['from', 'id']) || pickString(body, ['senderId'])
  const chatId = pickString(body, ['chatId', 'conversationId']) || pickString(message, ['chatId'])
  const content = text(message.text ?? body.text ?? message.content, 8000)
  if (from === '' || content === '') return { status: 400, body: 'from and message.text are required' }
  return {
    status: 202,
    body: { ok: true },
    events: [inboundPayload({
      conversationId: chatId || from,
      userId: from,
      messageId: pickString(message, ['id']) || pickString(body, ['id']) || `qr_${Date.now()}`,
      text: content,
      contactName: text(body.senderName ?? message.senderName, 120),
      handle: from,
      timestamp: Number(body.timestamp ?? message.timestamp) || Date.now() / 1000,
      attachments: [],
      replyContext: { bridge: true, session: text(channel.config?.sessionName, 80) || 'default' },
    })],
  }
}

/**
 * Send a text through the bridge.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const result = await bridgeCall(channel, '/messages/send', {
    method: 'POST',
    body: {
      session: text(channel.config?.sessionName, 80) || 'default',
      to: text(conversation.externalId, 300),
      text: text(message.text, 8000),
      messageId: text(message.id, 100),
    },
    timeout: 20_000,
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.ok === false) return { ok: false, error: text(result.data?.error ?? result.data?.detail, 300) || 'Bridge rejected the message.' }
  return { ok: true, error: '', externalId: text(result.data?.id ?? result.data?.messageId, 300) }
}

/**
 * Probe the bridge and session.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  if (text(channel.config?.bridgeUrl, 2000) === '') return { ok: false, detail: 'Bridge URL is required.' }
  if (text(channel.config?.bridgeToken, 500) === '') return { ok: false, detail: 'Bridge token is required.' }
  const current = await status(channel)
  if (!current.ok) return { ok: false, detail: current.detail }
  return {
    ok: true,
    detail: `Bridge ${current.status}${current.account === '' ? '' : ` · ${current.account}`}${current.detail === '' ? '' : ` · ${current.detail}`}`,
    account: current.account || undefined,
  }
}
