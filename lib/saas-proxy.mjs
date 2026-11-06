/**
 * Server-side proxy to the shared team API.
 *
 * The panel runs on the DSH origin, which may be HTTPS while the team API is a
 * plain HTTP service on another port or host. A browser fetch from the page
 * would be blocked (mixed content) or hit the wrong machine (127.0.0.1 is the
 * viewer's own loopback). The plugin's Host half forwards the call instead, so
 * the page only ever talks to its own origin.
 * @module dsh-im-omni/lib/saas-proxy
 */

/** Paths the proxy will forward; anything else is refused. */
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * Forward one API call to the team service.
 * @param {object} input - call description.
 * @param {string} input.base - team API origin, e.g. http://127.0.0.1:8090.
 * @param {string} input.path - absolute API path starting with /v1/.
 * @param {string} [input.method] - HTTP method, default GET.
 * @param {Record<string, string>} [input.headers] - headers, authorization included.
 * @param {unknown} [input.body] - JSON body for writes.
 * @param {typeof fetch} [input.fetchImpl] - injectable fetch.
 * @returns {Promise<{status: number, body: any}>} forwarded response.
 */
export async function forwardSaas(input) {
  const method = String(input.method ?? 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) throw new Error(`method not allowed: ${method}`)
  const path = String(input.path ?? '')
  if (!path.startsWith('/v1/')) throw new Error(`path not allowed: ${path}`)
  const base = String(input.base ?? '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(base)) throw new Error('base must be an http(s) origin')
  const headers = { accept: 'application/json', ...(input.headers ?? {}) }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  const fetchImpl = input.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetchImpl(base + path, {
      method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    })
    const text = await response.text()
    let body = null
    try {
      body = text === '' ? null : JSON.parse(text)
    } catch {
      body = { raw: text.slice(0, 500) }
    }
    return { status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}
