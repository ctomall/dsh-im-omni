/**
 * Telegram Bot API adapter (long polling or webhook).
 * @module dsh-im-omni/lib/channels/telegram
 */
import { text } from '../util.js'
import { header, inboundPayload, mediaPlaceholder, pickObject, pickString } from './common.js'
import { requestJson } from './http.js'
import { sameString } from './crypto.js'

/**
 * Bot API endpoint.
 * @param {Record<string, any>} channel - channel.
 * @param {string} method - Bot API method.
 * @returns {string} URL.
 */
export function botUrl(channel, method) {
  return `https://api.telegram.org/bot${text(channel.config?.botToken, 500)}/${method}`
}

/**
 * Extract a normalized message from one Telegram update.
 * @param {Record<string, any>} update - update object.
 * @returns {Record<string, any>|null} payload or null when not a message.
 */
export function parseUpdate(update) {
  if (update === null || typeof update !== 'object') return null
  const message = update.message ?? update.channel_post
  if (message === null || typeof message !== 'object') return null
  const chat = pickObject(message, ['chat'])
  const from = pickObject(message, ['from'])
  const chatId = pickString(message, ['chat', 'id'])
  if (chatId === '') return null
  const userId = pickString(message, ['from', 'id']) || chatId
  const type = text(message.media_group_id ? 'media group' : '', 40)
  let body = text(message.text ?? message.caption, 8000)
  if (body === '') {
    if (Array.isArray(message.photo) && message.photo.length > 0) body = mediaPlaceholder('photo')
    else if (message.voice !== undefined) body = mediaPlaceholder('voice')
    else if (message.audio !== undefined) body = mediaPlaceholder('audio')
    else if (message.video !== undefined) body = mediaPlaceholder('video')
    else if (message.document !== undefined) body = mediaPlaceholder('document')
    else if (message.sticker !== undefined) body = mediaPlaceholder('sticker')
    else if (message.location !== undefined) {
      const latitude = Number(message.location.latitude)
      const longitude = Number(message.location.longitude)
      body = Number.isFinite(latitude) && Number.isFinite(longitude) ? `[location] ${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : mediaPlaceholder('location')
    } else body = text(type, 100) || mediaPlaceholder('message')
  }
  const name = [from.first_name, from.last_name].filter((value) => typeof value === 'string' && value !== '').join(' ')
  const username = text(from.username, 120)
  const thread = Number.isInteger(message.message_thread_id) ? message.message_thread_id : null
  return inboundPayload({
    conversationId: chatId,
    userId,
    messageId: pickString(message, ['message_id']) || `tg_${Date.now()}`,
    text: body,
    contactName: text(name, 120) || (username === '' ? '' : `@${username}`),
    handle: username === '' ? '' : `@${username}`,
    timestamp: Number(message.date) || Date.now() / 1000,
    attachments: [],
    replyContext: thread === null ? { chatId } : { chatId, messageThreadId: thread },
  })
}

/**
 * Handle a Telegram webhook request.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  const expected = text(channel.config?.secretToken, 500)
  if (expected !== '') {
    const supplied = header(request.headers, 'x-telegram-bot-api-secret-token')
    if (!sameString(supplied, expected)) return { status: 401, body: 'invalid secret token' }
  }
  let update
  try {
    update = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  const event = parseUpdate(update)
  return { status: 200, body: { ok: true }, events: event === null ? [] : [event] }
}

/**
 * Send a text message.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const botToken = text(channel.config?.botToken, 500)
  if (botToken === '') return { ok: false, error: 'Telegram bot token is not configured.' }
  const body = {
    chat_id: text(conversation.externalId, 300),
    text: text(message.text, 8000),
    disable_web_page_preview: false,
  }
  const parseMode = text(channel.config?.parseMode, 20)
  if (parseMode === 'HTML' || parseMode === 'MarkdownV2' || parseMode === 'Markdown') body.parse_mode = parseMode
  const thread = Number(conversation.replyContext?.messageThreadId)
  if (Number.isInteger(thread) && thread > 0) body.message_thread_id = thread
  const result = await requestJson(botUrl(channel, 'sendMessage'), { method: 'POST', body })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.ok !== true) return { ok: false, error: text(result.data?.description, 300) || 'Telegram rejected the message.' }
  return { ok: true, error: '', externalId: String(result.data?.result?.message_id ?? '') }
}

/**
 * Long-poll one batch of updates.
 * @param {Record<string, any>} channel - channel.
 * @param {number} offset - next update offset.
 * @param {AbortSignal} [signal] - stop signal.
 * @returns {Promise<{ok:boolean,error:string,updates:any[],nextOffset:number}>} batch.
 */
export async function getUpdates(channel, offset, signal) {
  const body = {
    offset,
    timeout: 25,
    allowed_updates: ['message', 'channel_post'],
    limit: 50,
  }
  let response
  try {
    response = await fetch(botUrl(channel, 'getUpdates'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) return { ok: false, error: 'stopped', updates: [], nextOffset: offset }
    return { ok: false, error: error instanceof Error ? error.message : String(error), updates: [], nextOffset: offset }
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.ok !== true) {
    return { ok: false, error: text(data?.description, 300) || `HTTP ${response.status}`, updates: [], nextOffset: offset }
  }
  const updates = Array.isArray(data.result) ? data.result : []
  let nextOffset = offset
  for (const update of updates) {
    const id = Number(update?.update_id)
    if (Number.isFinite(id)) nextOffset = Math.max(nextOffset, id + 1)
  }
  return { ok: true, error: '', updates, nextOffset }
}

/**
 * Probe the bot identity.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  if (text(channel.config?.botToken, 500) === '') return { ok: false, detail: 'Bot token is required.' }
  const result = await requestJson(botUrl(channel, 'getMe'))
  if (!result.ok) return { ok: false, detail: result.error }
  if (result.data?.ok !== true) return { ok: false, detail: text(result.data?.description, 300) || 'getMe failed.' }
  const username = text(result.data?.result?.username, 120)
  return { ok: true, detail: username === '' ? 'Bot token is valid.' : `@${username}`, account: username === '' ? undefined : `@${username}` }
}
