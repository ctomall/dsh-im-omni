/**
 * Generic HTTP bridge adapter used by custom channels and legacy rows.
 * @module dsh-im-omni/lib/channels/generic
 */
import { signBody, text } from '../util.js'
import { authenticateBridge } from './common.js'
import { httpUrl, requestJson } from './http.js'

/**
 * Build a signed generic outbound envelope.
 * @param {Record<string, any>} state - workspace state.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Record<string, any>} envelope.
 */
export function envelope(state, channel, conversation, message) {
  const contact = state.contacts.find((item) => item.id === conversation.contactId)
  return {
    event: 'message.created',
    channelId: channel.id,
    conversation: {
      id: conversation.id,
      externalId: conversation.externalId,
      status: conversation.status,
    },
    contact: contact === undefined ? null : {
      id: contact.id,
      name: contact.name,
      handle: contact.handle,
      identities: contact.identities,
    },
    message: {
      id: message.id,
      text: message.text,
      createdAt: message.createdAt,
      direction: 'out',
      attachments: message.attachments,
    },
  }
}

/**
 * Authenticate and parse one generic bridge event.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,url:URL,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  if (!authenticateBridge(channel, request)) return { status: 401, body: 'invalid bridge token or signature' }
  let body
  try {
    body = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: 'payload must be an object' }
  return { status: 202, body: { ok: true }, events: [body] }
}

/**
 * POST a reply to the channel's outbound URL.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(state, channel, conversation, message) {
  const url = text(channel.outboundUrl ?? channel.config?.outboundUrl, 2000)
  if (url === '') return { ok: false, error: 'No outbound URL is configured for this channel.' }
  if (url.startsWith('demo://')) return { ok: true, error: '' }
  let parsed
  try {
    parsed = httpUrl(url, 'Outbound URL')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  const body = JSON.stringify(envelope(state, channel, conversation, message))
  const secret = text(channel.config?.bridgeToken, 500) || text(channel.secret, 500)
  const result = await requestJson(parsed.toString(), {
    method: 'POST',
    headers: {
      'x-im-omni-event': 'message.created',
      'x-im-omni-signature': signBody(secret, body),
    },
    body,
  })
  return result.ok ? { ok: true, error: '' } : { ok: false, error: result.error }
}

/**
 * Ping the outbound endpoint, or accept an inbound-only channel.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string}>} probe.
 */
export async function test(channel) {
  const url = text(channel.outboundUrl ?? channel.config?.outboundUrl, 2000)
  if (url === '') return { ok: true, detail: 'Inbound-only channel; token authentication is active.' }
  if (url.startsWith('demo://')) return { ok: true, detail: 'Demo channel; delivery is recorded locally.' }
  const body = JSON.stringify({ event: 'ping', channelId: channel.id, sentAt: new Date().toISOString(), source: 'dsh-im-omni' })
  const secret = text(channel.config?.bridgeToken, 500) || text(channel.secret, 500)
  const result = await requestJson(url, {
    method: 'POST',
    headers: {
      'x-im-omni-event': 'ping',
      'x-im-omni-signature': signBody(secret, body),
    },
    body,
  })
  return result.ok ? { ok: true, detail: `Bridge responded HTTP ${result.status}.` } : { ok: false, detail: result.error }
}
