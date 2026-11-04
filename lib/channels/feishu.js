/**
 * Feishu / Lark event subscription and Messaging API adapter.
 * @module @local/im-omni/lib/channels/feishu
 */
import { text } from '../util.js'
import { header, inboundPayload, mediaPlaceholder, pickObject, pickString } from './common.js'
import { requestJson } from './http.js'
import { decryptFeishu, verifyFeishuSignature } from './crypto.js'

/** Cached tenant access tokens. */
const tokens = new Map()

/**
 * Open-platform base URL.
 * @param {Record<string, any>} config - channel config.
 * @returns {string} base URL.
 */
export function openBase(config) {
  return text(config.domain, 20) === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn'
}

/**
 * Fetch and cache a tenant access token.
 * @param {Record<string, any>} config - channel config.
 * @param {boolean} [force=false] - bypass cache.
 * @returns {Promise<{ok:boolean,token:string,error:string}>} result.
 */
async function tenantToken(config, force = false) {
  const appId = text(config.appId, 200)
  const appSecret = text(config.appSecret, 1000)
  const key = `${openBase(config)}:${appId}:${appSecret}`
  const cached = tokens.get(key)
  if (!force && cached !== undefined && cached.expiresAt > Date.now()) return { ok: true, token: cached.token, error: '' }
  const result = await requestJson(`${openBase(config)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    body: { app_id: appId, app_secret: appSecret },
  })
  if (!result.ok) return { ok: false, token: '', error: result.error }
  if (result.data?.code !== 0) return { ok: false, token: '', error: text(result.data?.msg, 300) || 'tenant_access_token failed' }
  const token = text(result.data?.tenant_access_token, 3000)
  if (token === '') return { ok: false, token: '', error: 'Feishu returned no tenant_access_token.' }
  const expire = Math.max(60, Number(result.data?.expire) || 7200)
  tokens.set(key, { token, expiresAt: Date.now() + (expire - 120) * 1000 })
  return { ok: true, token, error: '' }
}

/**
 * Extract message text from Feishu's JSON content string.
 * @param {Record<string, any>} message - event.message.
 * @returns {string} text or media placeholder.
 */
function messageText(message) {
  const type = text(message.message_type, 50)
  let content = {}
  try {
    content = typeof message.content === 'string' ? JSON.parse(message.content) : (message.content ?? {})
  } catch {
    content = {}
  }
  if (type === 'text') return text(content.text, 8000)
  if (type === 'post') {
    const parts = []
    const body = content.content ?? content.zh_cn?.content ?? content.en_us?.content
    if (Array.isArray(body)) {
      for (const line of body) {
        if (!Array.isArray(line)) continue
        for (const item of line) {
          if (typeof item?.text === 'string') parts.push(item.text)
          else if (item?.tag === 'at') parts.push(`@${text(item.user_name, 80)}`)
        }
      }
    }
    return text(parts.join(' '), 8000) || mediaPlaceholder('post')
  }
  if (type === 'image') return mediaPlaceholder('image')
  if (type === 'file') return text(content.file_name, 200) ? `[file] ${text(content.file_name, 200)}` : mediaPlaceholder('file')
  if (type === 'audio') return mediaPlaceholder('audio')
  if (type === 'media') return mediaPlaceholder('video')
  if (type === 'sticker') return mediaPlaceholder('sticker')
  return mediaPlaceholder(type)
}

/**
 * Handle Feishu's event callback.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  const config = channel.config ?? {}
  const encryptKey = text(config.encryptKey, 500)
  let body
  try {
    body = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  if (encryptKey !== '') {
    const valid = verifyFeishuSignature(
      encryptKey,
      header(request.headers, 'x-lark-request-timestamp'),
      header(request.headers, 'x-lark-request-nonce'),
      request.rawBody,
      header(request.headers, 'x-lark-signature'),
    )
    if (!valid) return { status: 401, body: 'invalid signature' }
  }
  if (typeof body?.encrypt === 'string') {
    if (encryptKey === '') return { status: 400, body: 'encrypted event but no Encrypt Key configured' }
    try {
      body = JSON.parse(decryptFeishu(encryptKey, body.encrypt))
    } catch (error) {
      return { status: 400, body: error instanceof Error ? error.message : 'decryption failed' }
    }
  }
  const expectedToken = text(config.verificationToken, 500)
  const suppliedToken = text(body?.token ?? body?.header?.token, 500)
  if (expectedToken !== '' && suppliedToken !== expectedToken) return { status: 401, body: 'invalid verification token' }
  if (body?.type === 'url_verification') {
    return { status: 200, body: { challenge: text(body.challenge, 2000) } }
  }
  if (body?.header?.event_type !== 'im.message.receive_v1') {
    return { status: 200, body: { code: 0 }, events: [] }
  }
  const event = pickObject(body, ['event'])
  const message = pickObject(event, ['message'])
  const sender = pickObject(event, ['sender', 'sender_id'])
  const chatId = text(message.chat_id, 300)
  const userId = text(sender.open_id ?? sender.user_id ?? sender.union_id, 300) || chatId
  if (chatId === '') return { status: 200, body: { code: 0 }, events: [] }
  const payload = inboundPayload({
    conversationId: chatId,
    userId,
    messageId: text(message.message_id, 300) || `fs_${Date.now()}`,
    text: messageText(message),
    contactName: '',
    handle: userId,
    timestamp: Number(message.create_time) || Date.now(),
    attachments: [],
    replyContext: { chatId, threadId: text(message.thread_id, 200) || null },
  })
  return { status: 200, body: { code: 0 }, events: [payload] }
}

/**
 * Send one text message.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const config = channel.config ?? {}
  if (text(config.appId, 200) === '' || text(config.appSecret, 1000) === '') return { ok: false, error: 'Feishu app ID and secret are not configured.' }
  let token = await tenantToken(config)
  if (!token.ok) return { ok: false, error: token.error }
  const request = () => requestJson(`${openBase(config)}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.token}` },
    body: {
      receive_id: text(conversation.externalId, 300),
      msg_type: 'text',
      content: JSON.stringify({ text: text(message.text, 8000) }),
    },
  })
  let result = await request()
  if (result.ok && result.data?.code === 99991663) {
    token = await tenantToken(config, true)
    if (token.ok) result = await request()
  }
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.code !== 0) return { ok: false, error: text(result.data?.msg, 300) || `Feishu error ${result.data?.code}` }
  return { ok: true, error: '', externalId: text(result.data?.data?.message_id, 300) }
}

/**
 * Probe tenant_access_token.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  const config = channel.config ?? {}
  if (text(config.appId, 200) === '' || text(config.appSecret, 1000) === '') return { ok: false, detail: 'App ID and app secret are required.' }
  const token = await tenantToken(config, true)
  return token.ok
    ? { ok: true, detail: 'tenant_access_token acquired.', account: text(config.appId, 200) }
    : { ok: false, detail: token.error }
}
