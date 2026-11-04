/**
 * Channel registry: validation, webhook dispatch, outbound dispatch, probes.
 * @module @local/im-omni/lib/channels
 */
import { ApiError, clone, makeSecret, text } from '../util.js'
import { PLATFORMS, autoFields, platformOf, secretFields } from './catalog.js'
import * as whatsappCloud from './whatsapp-cloud.js'
import * as telegram from './telegram.js'
import * as wecom from './wecom.js'
import * as feishu from './feishu.js'
import * as slack from './slack.js'
import * as line from './line.js'
import * as dingtalk from './dingtalk.js'
import * as discord from './discord.js'
import * as qrBridge from './qr-bridge.js'
import * as whatsappQr from './whatsapp-qr.js'
import * as generic from './generic.js'
import { httpUrl } from './http.js'

/** Adapter lookup. */
const ADAPTERS = {
  whatsapp_cloud: whatsappCloud,
  whatsapp_qr: whatsappQr,
  wechat_qr: qrBridge,
  wecom,
  telegram,
  feishu,
  slack,
  discord,
  line,
  dingtalk,
  webhook: generic,
}

/** Values hidden from browser snapshots. */
export const MASK = '••••••••'

/**
 * Resolve an adapter by stored channel type.
 * @param {string} type - stored type.
 * @returns {typeof generic} adapter.
 */
export function adapterFor(type) {
  return ADAPTERS[type] ?? generic
}

/**
 * Resolve the platform definition, treating legacy rows as the custom bridge.
 * @param {string} type - stored type.
 * @returns {import('./catalog.js').Platform} platform.
 */
export function platformFor(type) {
  return platformOf(type) ?? platformOf('webhook')
}

/**
 * Validate a field value.
 * @param {import('./catalog.js').ChannelField} field - field definition.
 * @param {unknown} raw - submitted value.
 * @returns {string|boolean} normalized value.
 * @throws {ApiError} for invalid values.
 */
function fieldValue(field, raw) {
  if (field.type === 'boolean') return raw === true || raw === 'true'
  if (field.type === 'select') {
    const value = text(raw, 200)
    if (!field.options.some((option) => option.value === value)) {
      throw new ApiError(400, 'invalid-config', `${field.key} must be one of: ${field.options.map((option) => option.value).join(', ')}.`)
    }
    return value
  }
  const value = text(raw, field.key.toLowerCase().includes('secret') || field.secret ? 4000 : 2000)
  if (value === '' && !field.required) return ''
  if (field.key.endsWith('Url') && value !== '' && !value.startsWith('demo://')) httpUrl(value, field.key)
  return value
}

/**
 * Merge and validate channel configuration.
 * @param {string} type - platform id.
 * @param {Record<string, unknown>} input - submitted config.
 * @param {Record<string, any>} [existing={}] - stored config for update.
 * @returns {Record<string, any>} normalized config.
 * @throws {ApiError} when required fields are missing or invalid.
 */
export function normalizeConfig(type, input, existing = {}) {
  const platform = platformFor(type)
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(400, 'invalid-config', 'Channel configuration must be an object.')
  }
  const source = /** @type {Record<string, unknown>} */ (input)
  const config = {}
  for (const field of platform.fields) {
    const present = Object.prototype.hasOwnProperty.call(source, field.key)
    const raw = source[field.key]
    if (!present) {
      if (existing[field.key] !== undefined) config[field.key] = existing[field.key]
      else if (field.auto) config[field.key] = makeSecret()
      else if (field.type === 'select' && field.options.length > 0) config[field.key] = field.options[0].value
      else if (!field.required) config[field.key] = ''
      continue
    }
    if (field.secret && (raw === '' || raw === MASK)) {
      if (existing[field.key] !== undefined) config[field.key] = existing[field.key]
      else if (field.auto) config[field.key] = makeSecret()
      else config[field.key] = field.required ? '' : ''
      continue
    }
    config[field.key] = fieldValue(field, raw)
  }
  for (const key of autoFields(type)) {
    if (text(config[key], 1000) === '') config[key] = makeSecret()
  }
  if (type === 'wecom' && text(config.encodingAESKey, 100) !== '' && text(config.encodingAESKey, 100).length !== 43) {
    throw new ApiError(400, 'invalid-config', 'encodingAESKey must be exactly 43 characters.')
  }
  for (const field of platform.fields) {
    if (field.required && text(config[field.key], 4000) === '') {
      throw new ApiError(400, 'missing-config', `${field.key} is required for ${platform.label.en}.`)
    }
  }
  if (platform.requiresAny !== undefined) {
    const any = platform.requiresAny.some((key) => text(config[key], 4000) !== '')
    if (!any) throw new ApiError(400, 'missing-config', `${platform.requiresAny.join(' or ')} is required for ${platform.label.en}.`)
  }
  if (type === 'whatsapp_qr' && config.mode === 'bridge' && text(config.bridgeUrl, 2000) === '') {
    throw new ApiError(400, 'missing-config', 'bridgeUrl is required when WhatsApp QR uses external bridge mode.')
  }
  return config
}

/**
 * Browser-safe channel projection.
 * @param {Record<string, any>} channel - stored channel.
 * @returns {Record<string, any>} redacted channel.
 */
export function publicChannel(channel) {
  const copy = clone(channel)
  const platform = platformFor(channel.type)
  const secrets = {}
  copy.config = copy.config ?? {}
  if (copy.type === 'webhook' && !copy.config.outboundUrl && typeof channel.outboundUrl === 'string') copy.config.outboundUrl = channel.outboundUrl
  for (const key of secretFields(channel.type)) {
    secrets[key] = text(copy.config[key], 4000) !== ''
    copy.config[key] = copy.config[key] === undefined || copy.config[key] === '' ? '' : MASK
  }
  delete copy.secret
  copy.secretSet = text(channel.secret, 500) !== ''
  copy.configuredSecrets = secrets
  copy.platform = {
    id: platform.id,
    label: platform.label,
    caption: platform.caption,
    badge: platform.badge,
    hue: platform.hue,
    transport: platform.transport,
    official: platform.official,
    capabilities: platform.capabilities,
  }
  copy.webhookPath = `/api/im-omni.webhook/${encodeURIComponent(channel.id)}`
  copy.health = channel.runtime?.health ?? 'ready'
  return copy
}

/**
 * Secret config values for an explicit owner reveal.
 * @param {Record<string, any>} channel - channel.
 * @returns {Record<string,string>} secret values.
 */
export function revealSecrets(channel) {
  const result = {}
  for (const key of secretFields(channel.type)) {
    const value = text(channel.config?.[key], 4000)
    if (value !== '') result[key] = value
  }
  return result
}

/**
 * Ensure a stored type is supported.
 * @param {unknown} value - requested type.
 * @returns {string} supported type.
 * @throws {ApiError} when unknown.
 */
export function requireType(value) {
  const type = text(value, 60) || 'webhook'
  if (!PLATFORMS.some((platform) => platform.id === type)) throw new ApiError(400, 'unknown-channel-type', `Unknown channel type "${type}".`)
  return type
}

/**
 * Dispatch one callback request.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,url:URL,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  const adapter = adapterFor(channel.type)
  if (typeof adapter.handleWebhook !== 'function') {
    return { status: 404, body: 'this channel does not accept webhooks' }
  }
  return adapter.handleWebhook(channel, request)
}

/**
 * Send one outbound message through the native provider.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function sendOutbound(state, channel, conversation, message) {
  const adapter = adapterFor(channel.type)
  if (typeof adapter.send !== 'function') return { ok: false, error: `No outbound sender for ${channel.type}.` }
  if (channel.type === 'webhook') return adapter.send(state, channel, conversation, message)
  return adapter.send(channel, conversation, message)
}

/**
 * Probe a channel.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function testChannel(channel, runtime) {
  const adapter = adapterFor(channel.type)
  if (typeof adapter.test !== 'function') return { ok: false, detail: `No test for ${channel.type}.` }
  try {
    return await adapter.test(channel, runtime)
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Read a QR session status.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<Record<string, any>>} status.
 */
export async function qrStatus(channel, runtime) {
  if (channel.type !== 'whatsapp_qr' && channel.type !== 'wechat_qr') throw new ApiError(400, 'not-qr-channel', 'This channel does not use QR login.')
  try {
    const adapter = adapterFor(channel.type)
    return await adapter.status(channel, runtime)
  } catch (error) {
    return { ok: false, status: 'error', detail: error instanceof Error ? error.message : String(error), qrDataUrl: '', account: '', updatedAt: '' }
  }
}

/**
 * Start a session and fetch its QR image.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<Record<string, any>>} QR payload.
 */
export async function qrLogin(channel, runtime) {
  if (channel.type !== 'whatsapp_qr' && channel.type !== 'wechat_qr') throw new ApiError(400, 'not-qr-channel', 'This channel does not use QR login.')
  try {
    const adapter = adapterFor(channel.type)
    return await adapter.qr(channel, runtime)
  } catch (error) {
    return { ok: false, status: 'error', detail: error instanceof Error ? error.message : String(error), qrDataUrl: '', account: '', updatedAt: '' }
  }
}
