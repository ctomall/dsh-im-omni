/**
 * WhatsApp QR dispatcher: embedded Baileys by default, optional external bridge.
 * @module dsh-im-omni/lib/channels/whatsapp-qr
 */
import * as bridge from './qr-bridge.js'
import * as embedded from './whatsapp-embedded.js'

/**
 * Whether the channel uses the in-Host Baileys session.
 * @param {Record<string, any>} channel - channel.
 * @returns {boolean} embedded.
 */
export function isEmbedded(channel) {
  return channel.config?.mode !== 'bridge'
}

/**
 * Handle an inbound webhook (bridge mode only).
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,url:URL,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} response.
 */
export async function handleWebhook(channel, request) {
  if (isEmbedded(channel)) return { status: 404, body: 'embedded WhatsApp sessions do not use a webhook' }
  return bridge.handleWebhook(channel, request)
}

/**
 * Start/fetch QR.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} runtime - Host runtime.
 * @returns {Promise<Record<string, any>>} result.
 */
export async function qr(channel, runtime) {
  return isEmbedded(channel) ? embedded.qr(channel, runtime) : bridge.qr(channel)
}

/**
 * Read status.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<Record<string, any>>} result.
 */
export async function status(channel) {
  return isEmbedded(channel) ? embedded.status(channel) : bridge.status(channel)
}

/**
 * Send one text.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  return isEmbedded(channel) ? embedded.send(channel, conversation, message) : bridge.send(channel, conversation, message)
}

/**
 * Probe the session.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} runtime - Host runtime.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} result.
 */
export async function test(channel, runtime) {
  return isEmbedded(channel) ? embedded.test(channel, runtime) : bridge.test(channel)
}

/**
 * Stop one embedded session.
 * @param {string} channelId - channel id.
 * @returns {void}
 */
export function stop(channelId) {
  embedded.stop(channelId)
}
