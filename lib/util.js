/**
 * Small primitives shared by the IM omnichannel Host half.
 * @module dsh-im-omni/lib/util
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** One command or route failure with an HTTP status and stable code. */
export class ApiError extends Error {
  /**
   * @param {number} status - HTTP status.
   * @param {string} code - stable machine-readable code.
   * @param {string} message - human-readable detail.
   */
  constructor(status, code, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * Current instant as an ISO string.
 * @returns {string} ISO timestamp.
 */
export function nowIso() {
  return new Date().toISOString()
}

/**
 * Create a collision-resistant id with a readable prefix.
 * @param {string} prefix - entity prefix.
 * @returns {string} id.
 */
export function makeId(prefix) {
  return `${prefix}_${randomBytes(6).toString('hex')}`
}

/**
 * Create the opaque bearer secret for one inbound bridge.
 * @returns {string} 48 hex characters.
 */
export function makeSecret() {
  return randomBytes(24).toString('hex')
}

/**
 * Coerce a value to a trimmed string with an optional length cap.
 * @param {unknown} value - source value.
 * @param {number} [max=4000] - maximum length.
 * @returns {string} normalized text.
 */
export function text(value, max = 4000) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/**
 * Coerce a value to a finite integer in a range.
 * @param {unknown} value - source value.
 * @param {number} fallback - fallback.
 * @param {number} min - inclusive minimum.
 * @param {number} max - inclusive maximum.
 * @returns {number} normalized integer.
 */
export function integer(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/**
 * Coerce a value to one of a fixed set.
 * @template {string} T
 * @param {unknown} value - source value.
 * @param {readonly T[]} allowed - accepted values.
 * @param {T} fallback - fallback.
 * @returns {T} normalized value.
 */
export function oneOf(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback
}

/**
 * Validate an absolute http(s) URL. An empty string is accepted and means "inbound only".
 * @param {unknown} value - source value.
 * @returns {string} normalized URL or an empty string.
 * @throws {ApiError} when the URL is not absolute http(s).
 */
export function outboundUrl(value) {
  const raw = text(value, 2000)
  if (raw === '') return ''
  if (raw.startsWith('demo://')) return raw
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new ApiError(400, 'invalid-url', 'The outbound URL must be an absolute http(s) URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApiError(400, 'invalid-url', 'The outbound URL must use http or https.')
  }
  return parsed.toString()
}

/**
 * Stable JSON clone for Host-owned data.
 * @template T
 * @param {T} value - source.
 * @returns {T} detached clone.
 */
export function clone(value) {
  return structuredClone(value)
}

/**
 * JSON response helper.
 * @param {unknown} body - payload.
 * @param {number} [status=200] - status code.
 * @param {Record<string,string>} [headers] - extra headers.
 * @returns {Response} response.
 */
export function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...headers },
  })
}

/**
 * Constant-time string comparison for bridge secrets.
 * @param {string} left - supplied value.
 * @param {string} right - expected value.
 * @returns {boolean} whether both match.
 */
export function equalSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left === '' || right === '') return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * HMAC-SHA256 signature in the `sha256=<hex>` form the bridge header uses.
 * @param {string} secret - channel secret.
 * @param {string} body - raw request body.
 * @returns {string} signature header value.
 */
export function signBody(secret, body) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

/**
 * Short non-secret fingerprint for diagnostics.
 * @param {string} secret - channel secret.
 * @returns {string} first 8 hex characters.
 */
export function secretFingerprint(secret) {
  return createHash('sha256').update(secret).digest('hex').slice(0, 8)
}

/**
 * Read a request body as text with a hard byte limit.
 * @param {import('node:http').IncomingMessage} request - request.
 * @param {number} [limit=262144] - maximum bytes.
 * @returns {Promise<string>} raw body.
 * @throws {ApiError} when the body is too large.
 */
export function readRequestBody(request, limit = 262144) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new ApiError(413, 'body-too-large', `The request body exceeds ${limit} bytes.`))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/**
 * Write a JSON response through a raw Node response.
 * @param {import('node:http').ServerResponse} response - response.
 * @param {number} status - status code.
 * @param {unknown} body - payload.
 * @returns {void}
 */
export function writeJson(response, status, body) {
  const encoded = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(encoded),
    'cache-control': 'no-store',
  })
  response.end(encoded)
}

/**
 * Describe a thrown value without leaking stack traces to the browser.
 * @param {unknown} error - thrown value.
 * @returns {{status:number, code:string, message:string}} normalized failure.
 */
export function failureOf(error) {
  if (error instanceof ApiError) {
    return { status: error.status, code: error.code, message: error.message }
  }
  const message = error instanceof Error && error.message !== '' ? error.message : String(error)
  return { status: 500, code: 'internal', message }
}

/**
 * Build a serial executor: every task waits for the previous task, and one
 * rejected task does not poison the chain.
 * @returns {(task:() => Promise<unknown>) => Promise<unknown>} enqueue function.
 */
export function createSerial() {
  let tail = Promise.resolve()
  return (task) => {
    const next = tail.then(task, task)
    tail = next.catch(() => {})
    return next
  }
}
