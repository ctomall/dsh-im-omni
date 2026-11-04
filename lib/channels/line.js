/**
 * LINE Messaging API adapter.
 * @module @local/im-omni/lib/channels/line
 */
import { text } from '../util.js'
import { header, inboundPayload, mediaPlaceholder, pickArray, pickObject, pickString } from './common.js'
import { requestJson } from './http.js'
import { hmac, sameString } from './crypto.js'

/**
 * Handle LINE's webhook.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  const secret = text(channel.config?.channelSecret, 500)
  if (secret === '') return { status: 400, body: 'channel secret is not configured' }
  if (!sameString(header(request.headers, 'x-line-signature'), hmac(secret, request.rawBody, 'base64'))) {
    return { status: 401, body: 'invalid signature' }
  }
  let body
  try {
    body = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  const events = []
  for (const event of pickArray(body, ['events'])) {
    if (event?.type !== 'message') continue
    const message = pickObject(event, ['message'])
    const source = pickObject(event, ['source'])
    const conversationId = text(source.groupId ?? source.roomId ?? source.userId, 300)
    const userId = text(source.userId ?? source.groupId ?? source.roomId, 300) || conversationId
    if (conversationId === '') continue
    const type = text(message.type, 40)
    let content = ''
    if (type === 'text') content = text(message.text, 8000)
    else if (type === 'location') {
      const latitude = Number(message.latitude)
      const longitude = Number(message.longitude)
      content = Number.isFinite(latitude) && Number.isFinite(longitude) ? `[location] ${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : mediaPlaceholder(type)
    } else content = mediaPlaceholder(type)
    events.push(inboundPayload({
      conversationId,
      userId,
      messageId: text(message.id, 300) || `line_${Date.now()}`,
      text: content,
      contactName: '',
      handle: userId,
      timestamp: Number(event.timestamp) || Date.now(),
      attachments: [],
      replyContext: { sourceType: text(source.type, 20), userId, replyToken: text(event.replyToken, 500) },
    }))
  }
  return { status: 200, body: { ok: true }, events }
}

/**
 * Send a push message.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const token = text(channel.config?.channelAccessToken, 3000)
  if (token === '') return { ok: false, error: 'LINE channel access token is not configured.' }
  const result = await requestJson('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: {
      to: text(conversation.externalId, 300),
      messages: [{ type: 'text', text: text(message.text, 5000) }],
    },
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, error: '', externalId: text(result.data?.sentMessages?.[0]?.id, 300) }
}

/**
 * Probe bot info.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  const token = text(channel.config?.channelAccessToken, 3000)
  if (token === '') return { ok: false, detail: 'Channel access token is required.' }
  const result = await requestJson('https://api.line.me/v2/bot/info', {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!result.ok) return { ok: false, detail: result.error }
  const name = text(result.data?.displayName, 120)
  const id = text(result.data?.userId, 120)
  return { ok: true, detail: `${name || 'LINE bot'}${id === '' ? '' : ` · ${id}`}`, account: name || id }
}
