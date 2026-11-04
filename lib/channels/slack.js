/**
 * Slack Events API adapter.
 * @module @local/im-omni/lib/channels/slack
 */
import { text } from '../util.js'
import { header, inboundPayload, mediaPlaceholder, pickObject, pickString } from './common.js'
import { requestJson } from './http.js'
import { verifySlackSignature } from './crypto.js'

/**
 * Handle Slack URL verification and event callbacks.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  const secret = text(channel.config?.signingSecret, 500)
  if (secret === '') return { status: 400, body: 'signing secret is not configured' }
  if (!verifySlackSignature(
    secret,
    header(request.headers, 'x-slack-request-timestamp'),
    request.rawBody,
    header(request.headers, 'x-slack-signature'),
  )) return { status: 401, body: 'invalid signature' }
  let body
  try {
    body = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  if (body?.type === 'url_verification') {
    return { status: 200, body: { challenge: text(body.challenge, 2000) } }
  }
  if (body?.type === 'event_callback') {
    const event = pickObject(body, ['event'])
    const type = text(event.type, 50)
    const subtype = text(event.subtype, 50)
    const ignoredSubtypes = new Set(['bot_message', 'message_changed', 'message_deleted', 'channel_join', 'channel_leave', 'channel_topic'])
    if ((type === 'message' || type === 'app_mention') && !ignoredSubtypes.has(subtype) && event.bot_id === undefined) {
      const channelId = text(event.channel, 300)
      const userId = text(event.user, 300) || channelId
      if (channelId !== '') {
        const mention = /<@[A-Z0-9]+>/g
        const bodyText = text(String(event.text ?? '').replace(mention, ''), 8000)
          || mediaPlaceholder(Array.isArray(event.files) && event.files.length > 0 ? 'file' : 'message')
        const threadTs = text(event.thread_ts, 100)
        const eventTs = text(event.ts, 100)
        return {
          status: 200,
          body: { ok: true },
          events: [inboundPayload({
            conversationId: channelId,
            userId,
            messageId: eventTs || `sl_${Date.now()}`,
            text: bodyText,
            contactName: text(event.username ?? event.user_profile?.display_name, 120),
            handle: userId,
            timestamp: eventTs === '' ? Date.now() / 1000 : Number(eventTs) || Date.now() / 1000,
            attachments: [],
            replyContext: { channelId, threadTs: threadTs || eventTs || null },
          })],
        }
      }
    }
  }
  return { status: 200, body: { ok: true }, events: [] }
}

/**
 * Send one message through chat.postMessage.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const token = text(channel.config?.botToken, 2000)
  if (token === '') return { ok: false, error: 'Slack bot token is not configured.' }
  const body = {
    channel: text(conversation.externalId, 300),
    text: text(message.text, 8000),
    unfurl_links: false,
    unfurl_media: false,
  }
  const threadTs = text(conversation.replyContext?.threadTs, 100)
  if (threadTs !== '') body.thread_ts = threadTs
  const result = await requestJson('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body,
  })
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.ok !== true) return { ok: false, error: text(result.data?.error, 300) || 'Slack rejected the message.' }
  return { ok: true, error: '', externalId: text(result.data?.ts, 100) }
}

/**
 * Probe auth.test.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  const token = text(channel.config?.botToken, 2000)
  if (token === '') return { ok: false, detail: 'Bot token is required.' }
  const result = await requestJson('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  if (!result.ok) return { ok: false, detail: result.error }
  if (result.data?.ok !== true) return { ok: false, detail: text(result.data?.error, 300) || 'auth.test failed.' }
  const name = text(result.data?.user, 120)
  const team = text(result.data?.team, 120)
  return { ok: true, detail: `${name || 'bot'} @ ${team || 'workspace'}`, account: name || undefined }
}
