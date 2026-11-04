/**
 * Small HTTP client used by channel adapters.
 *
 * Every request is bounded by a timeout and normalized to a result object so
 * outbound failures become message errors instead of unhandled rejections.
 * @module @local/im-omni/lib/channels/http
 */
import { ApiError } from '../util.js'

/** Default timeout for provider APIs. */
const DEFAULT_TIMEOUT = 12_000

/**
 * Parse and validate an absolute http(s) URL.
 * @param {unknown} value - source.
 * @param {string} [label='URL'] - field label.
 * @returns {URL} parsed URL.
 * @throws {ApiError} when invalid.
 */
export function httpUrl(value, label = 'URL') {
  let parsed
  try {
    parsed = new URL(String(value ?? ''))
  } catch {
    throw new ApiError(400, 'invalid-url', `${label} must be an absolute http(s) URL.`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApiError(400, 'invalid-url', `${label} must use http or https.`)
  }
  return parsed
}

/**
 * Join a bridge root URL and a path without doubling slashes.
 * @param {string} root - bridge root.
 * @param {string} path - path beginning with /.
 * @returns {string} absolute URL.
 */
export function joinUrl(root, path) {
  return `${String(root).replace(/\/+$/, '')}${path}`
}

/**
 * Perform a JSON HTTP request.
 * @param {string} url - absolute URL.
 * @param {{
 *   method?:string,
 *   headers?:Record<string,string>,
 *   body?:unknown,
 *   form?:Record<string,string>,
 *   timeout?:number,
 *   fetchImpl?:typeof fetch
 * }} [options] - request options.
 * @returns {Promise<{ok:boolean,status:number,data:any,text:string,error:string}>} result.
 */
export async function requestJson(url, options = {}) {
  const method = options.method ?? 'GET'
  const headers = { accept: 'application/json', 'user-agent': 'dsh-im-omni/2.0', ...(options.headers ?? {}) }
  let body
  if (options.form !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(options.form).toString()
  } else if (options.body !== undefined) {
    headers['content-type'] = headers['content-type'] ?? 'application/json'
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  }
  let response
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(options.timeout ?? DEFAULT_TIMEOUT),
    })
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
  const text = await response.text().catch(() => '')
  let data = null
  if (text !== '') {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!response.ok) {
    const detail = data?.error?.message ?? data?.message ?? data?.errmsg ?? data?.msg ?? text.slice(0, 240)
    return { ok: false, status: response.status, data, text, error: `HTTP ${response.status}${detail === '' ? '' : `: ${detail}`}` }
  }
  return { ok: true, status: response.status, data, text, error: '' }
}

/**
 * Read a string field from an unknown object.
 * @param {unknown} value - source object.
 * @param {string} key - field.
 * @returns {string} string or empty.
 */
export function str(value, key) {
  if (value === null || typeof value !== 'object') return ''
  const item = /** @type {Record<string, unknown>} */ (value)[key]
  return typeof item === 'string' ? item : (typeof item === 'number' ? String(item) : '')
}
