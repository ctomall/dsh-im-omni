/**
 * WhatsApp Business Cloud API adapter.
 * @module @local/im-omni/lib/channels/whatsapp-cloud
 */
import { text } from '../util.js'
import { inboundPayload, header, mediaPlaceholder, pickArray, pickObject, pickString } from './common.js'
import { requestJson } from './http.js'
import { verifyMetaSignature } from './crypto.js'

/**
 * Graph API version with a conservative default.
 * @param {Record<string, any>} config - channel config.
 * @returns {string} version segment.
 */
function versionOf(config) {
  const value = text(config.graphVersion, 16)
  return /^v\d{1,3}\.\d{1,2}$/.test(value) ? value : 'v23.0'
}

/**
 * Graph API endpoint.
 * @param {Record<string, any>} config - channel config.
 * @param {string} path - path after the version.
 * @returns {string} URL.
 */
function graphUrl(config, path) {
  return `https://graph.facebook.com/${versionOf(config)}/${path}`
}

/**
 * Verify Meta's GET challenge.
 * @param {Record<string, any>} channel - channel.
 * @param {URL} url - request URL.
 * @returns {{status:number,body:string,headers?:Record<string,string>}|null} response or null.
 */
function verifyChallenge(channel, url) {
  if (url.searchParams.get('hub.mode') !== 'subscribe') return null
  const supplied = url.searchParams.get('hub.verify_token') ?? ''
  const expected = text(channel.config?.verifyToken, 500)
  if (expected === '' || supplied !== expected) {
    return { status: 403, body: 'verification failed', headers: { 'content-type': 'text/plain; charset=utf-8' } }
  }
  return {
    status: 200,
    body: url.searchParams.get('hub.challenge') ?? '',
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  }
}

/**
 * Handle a Meta webhook request.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,url:URL,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method === 'GET') {
    const challenge = verifyChallenge(channel, request.url)
    if (challenge !== null) return challenge
    return { status: 400, body: 'unsupported verification request', headers: { 'content-type': 'text/plain; charset=utf-8' } }
  }
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  const signature = header(request.headers, 'x-hub-signature-256')
  if (!verifyMetaSignature(String(channel.config?.appSecret ?? ''), request.rawBody, signature)) {
    return { status: 401, body: 'invalid signature' }
  }
  let payload
  try {
    payload = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  const events = []
  for (const entry of pickArray(payload, ['entry'])) {
    for (const change of pickArray(entry, ['changes'])) {
      const value = pickObject(change, ['value'])
      const contacts = pickArray(value, ['contacts'])
      const contact = pickObject(contacts[0], [])
      const profile = pickObject(contact, ['profile'])
      for (const message of pickArray(value, ['messages'])) {
        const from = text(message?.from, 300)
        if (from === '') continue
        const type = text(message?.type, 40)
        let body = ''
        let attachments = []
        if (type === 'text') body = text(message?.text?.body, 8000)
        else if (type === 'button') body = text(message?.button?.text, 8000)
        else if (type === 'interactive') {
          body = text(message?.interactive?.button_reply?.title ?? message?.interactive?.list_reply?.title, 8000)
        } else if (type === 'location') {
          const latitude = Number(message?.location?.latitude)
          const longitude = Number(message?.location?.longitude)
          body = Number.isFinite(latitude) && Number.isFinite(longitude)
            ? `[location] ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
            : mediaPlaceholder(type)
        } else {
          body = text(message?.image?.caption ?? message?.video?.caption ?? message?.document?.caption, 8000)
            || mediaPlaceholder(type)
        }
        const media = message?.image ?? message?.video ?? message?.document ?? message?.audio
        if (media !== null && typeof media === 'object' && typeof media.id === 'string') {
          attachments = [{
            name: text(media.filename, 200) || `${type}-${text(media.id, 100)}`,
            url: '',
            type: text(media.mime_type, 120),
            size: Number(media.file_size) || 0,
            providerId: text(media.id, 200),
          }]
        }
        events.push(inboundPayload({
          conversationId: from,
          userId: from,
          messageId: text(message?.id, 300) || `wa_${Date.now()}_${events.length}`,
          text: body,
          contactName: text(profile.name, 120) || text(contact.wa_id, 60),
          handle: text(contact.wa_id, 60),
          phone: text(contact.wa_id, 60),
          timestamp: Number(message?.timestamp) || Date.now() / 1000,
          attachments,
          replyContext: { waId: from, phoneNumberId: text(value?.metadata?.phone_number_id, 100) },
        }))
      }
    }
  }
  return { status: 200, body: { ok: true }, events }
}

/**
 * Send one text reply through Graph.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const config = channel.config ?? {}
  const phoneNumberId = text(config.phoneNumberId, 100)
  const accessToken = text(config.accessToken, 2000)
  if (phoneNumberId === '' || accessToken === '') return { ok: false, error: 'WhatsApp Cloud API is not configured.' }
  const result = await requestJson(graphUrl(config, `${encodeURIComponent(phoneNumberId)}/messages`), {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: text(conversation.externalId, 300),
      type: 'text',
      text: { preview_url: true, body: text(message.text, 8000) },
    },
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, error: '', externalId: text(result.data?.messages?.[0]?.id, 300) }
}

/**
 * Probe the phone number through Graph.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  const config = channel.config ?? {}
  const phoneNumberId = text(config.phoneNumberId, 100)
  const accessToken = text(config.accessToken, 2000)
  if (phoneNumberId === '' || accessToken === '') return { ok: false, detail: 'Phone number ID and access token are required.' }
  const result = await requestJson(graphUrl(config, `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`), {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!result.ok) return { ok: false, detail: result.error }
  const phone = text(result.data?.display_phone_number, 60)
  const name = text(result.data?.verified_name, 120)
  return { ok: true, detail: `${phone || phoneNumberId}${name === '' ? '' : ` · ${name}`}`, account: phone || phoneNumberId }
}
