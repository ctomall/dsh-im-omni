/**
 * Shared normalization and authentication helpers for channel adapters.
 * @module @local/im-omni/lib/channels/common
 */
import { signBody, text } from '../util.js'
import { sameString } from './crypto.js'
import { str } from './http.js'

/**
 * Read one raw Node header.
 * @param {import('node:http').IncomingHttpHeaders} headers - request headers.
 * @param {string} name - lower-case header name.
 * @returns {string} value.
 */
export function header(headers, name) {
  const value = headers[name]
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

/**
 * Read a query parameter with a fallback.
 * @param {URL} url - request URL.
 * @param {string} name - parameter name.
 * @param {string} [fallback=''] - fallback.
 * @returns {string} value.
 */
export function query(url, name, fallback = '') {
  return url.searchParams.get(name) ?? fallback
}

/**
 * Build one normalized bridge payload that the existing ingest path accepts.
 * @param {{
 *   conversationId:string,
 *   userId:string,
 *   messageId:string,
 *   text:string,
 *   contactName?:string,
 *   handle?:string,
 *   email?:string,
 *   phone?:string,
 *   timestamp?:string|number,
 *   attachments?:Array<Record<string, unknown>>,
 *   replyContext?:Record<string, unknown>|null
 * }} message - normalized message.
 * @returns {Record<string, any>} bridge payload.
 */
export function inboundPayload(message) {
  const timestamp = message.timestamp === undefined
    ? new Date().toISOString()
    : (typeof message.timestamp === 'number'
      ? new Date(message.timestamp < 1e12 ? message.timestamp * 1000 : message.timestamp).toISOString()
      : message.timestamp)
  return {
    event: 'message.created',
    externalConversationId: message.conversationId,
    externalMessageId: message.messageId,
    externalUserId: message.userId,
    contact: {
      id: message.userId,
      name: message.contactName ?? '',
      handle: message.handle ?? '',
      email: message.email ?? '',
      phone: message.phone ?? '',
    },
    message: {
      text: message.text,
      attachments: message.attachments ?? [],
    },
    timestamp,
    ...(message.replyContext === undefined || message.replyContext === null
      ? {}
      : { replyContext: message.replyContext }),
  }
}

/**
 * Placeholder label for unsupported media, so a media-only message still
 * enters the inbox instead of being dropped.
 * @param {string} type - platform content type.
 * @returns {string} human-readable placeholder.
 */
export function mediaPlaceholder(type) {
  const map = {
    image: '[image]', photo: '[photo]', video: '[video]', audio: '[audio]', voice: '[voice]',
    document: '[document]', file: '[file]', sticker: '[sticker]', animation: '[animation]',
    location: '[location]', contact: '[contact]', video_note: '[video note]',
  }
  return map[String(type ?? '').toLowerCase()] ?? `[${String(type ?? 'attachment')}]`
}

/**
 * Build one text attachment when a platform exposes a public media URL.
 * @param {{name?:string,url?:string,type?:string,size?:number}} source - metadata.
 * @returns {Record<string, any>|null} attachment or null.
 */
export function attachment(source) {
  const url = text(source.url, 2000)
  if (url === '') return null
  return {
    name: text(source.name, 200) || 'attachment',
    url,
    type: text(source.type, 120),
    size: Number.isFinite(source.size) ? Math.max(0, Math.min(100_000_000, Number(source.size))) : 0,
  }
}

/**
 * Verify a bridge request against a channel's bridge token or secret.
 *
 * Supports ?token=, x-im-omni-token, Authorization: Bearer, and an HMAC
 * signature of the raw body using the same secret.
 * @param {Record<string, any>} channel - channel record.
 * @param {{url:URL,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {boolean} authenticated.
 */
export function authenticateBridge(channel, request) {
  const authorization = header(request.headers, 'authorization')
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const token = request.url.searchParams.get('token') || header(request.headers, 'x-im-omni-token') || bearer
  const signature = header(request.headers, 'x-im-omni-signature')
  const secret = text(channel.config?.bridgeToken, 500) || text(channel.secret, 500)
  if (secret === '') return false
  if (sameString(token, secret)) return true
  if (signature === '' || request.rawBody === '') return false
  return sameString(signature, signBody(secret, request.rawBody))
}

/**
 * Resolve a display name from platform contact fields.
 * @param {Array<string|undefined|null>} values - candidates.
 * @param {string} fallback - fallback.
 * @returns {string} display name.
 */
export function displayName(values, fallback = 'Unknown contact') {
  for (const value of values) {
    const name = text(value, 120)
    if (name !== '') return name
  }
  return fallback
}

/**
 * Read a nested property without throwing.
 * @param {unknown} value - root.
 * @param {string[]} path - keys.
 * @returns {unknown} nested value.
 */
export function pick(value, path) {
  let current = value
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = /** @type {Record<string, unknown>} */ (current)[key]
  }
  return current
}

/**
 * Read a string from a nested property.
 * @param {unknown} value - root.
 * @param {string[]} path - keys.
 * @returns {string} string or empty.
 */
export function pickString(value, path) {
  const item = pick(value, path)
  return typeof item === 'string' ? item : (typeof item === 'number' ? String(item) : '')
}

/**
 * Read an object from a nested property.
 * @param {unknown} value - root.
 * @param {string[]} path - keys.
 * @returns {Record<string, any>} object or empty.
 */
export function pickObject(value, path) {
  const item = pick(value, path)
  return item !== null && typeof item === 'object' && !Array.isArray(item) ? /** @type {Record<string, any>} */ (item) : {}
}

/**
 * Read an array from a nested property.
 * @param {unknown} value - root.
 * @param {string[]} path - keys.
 * @returns {any[]} array or empty.
 */
export function pickArray(value, path) {
  const item = pick(value, path)
  return Array.isArray(item) ? item : []
}

export { str }
