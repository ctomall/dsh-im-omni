/**
 * Inbound media persistence.
 *
 * Channels hand us either a durable provider handle (WhatsApp Cloud media id)
 * or a provider URL that expires, needs a bearer token, or both. Rendering
 * those directly in the workspace document means a bubble that works once and
 * 404s afterwards, and it puts provider credentials in the browser snapshot.
 *
 * This module downloads each inbound attachment once, through the channel's
 * own contract, and stores the bytes with the existing attachment store. The
 * message then carries the same `{ id, name, type, size, url }` descriptor an
 * outbound file has, so the Client renders both from one code path and the
 * file survives provider URL rotation.
 *
 * Failure is non-fatal by design: the message keeps whatever the provider
 * gave us plus an `error` string, and the inbox still shows the placeholder
 * text the adapter produced.
 *
 * @module dsh-im-omni/lib/media
 */
import { saveAttachment, MAX_ATTACHMENT_BYTES, isLocalAttachment } from './attachments.js'

/** Per-attachment download budget. */
export const DEFAULT_TIMEOUT_MS = 15_000

/** How many attachments one inbound message may persist at a time. */
export const MAX_PER_MESSAGE = 5

/** Hosts a WhatsApp Cloud media handle may redirect us to. */
const WHATSAPP_MEDIA_HOSTS = ['graph.facebook.com', 'lookaside.fbsbx.com', 'cdn.fbsbx.com']

/**
 * Whether one inbound attachment still needs to be downloaded.
 * @param {Record<string, any>} attachment - inbound attachment descriptor.
 * @returns {boolean} true when bytes are still remote.
 */
export function needsPersist(attachment) {
  if (attachment === null || typeof attachment !== 'object') return false
  if (isLocalAttachment(attachment)) return false
  if (typeof attachment.id === 'string' && attachment.id.startsWith('att_')) return false
  return typeof attachment.providerId === 'string' && attachment.providerId !== ''
    || typeof attachment.url === 'string' && /^https?:\/\//u.test(attachment.url)
}

/**
 * Pick the attachments of one message that still need bytes.
 * @param {Record<string, any>} message - stored message.
 * @returns {Array<Record<string, any>>} attachments to persist.
 */
export function pendingOf(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  return attachments.filter(needsPersist).slice(0, MAX_PER_MESSAGE)
}

/**
 * Reject hosts that are not part of the provider's own media plane.
 * @param {string} target - absolute URL.
 * @param {Array<string>} allow - allowed hostnames.
 * @returns {string} hostname; throws when the host is not allowed.
 */
function assertHost(target, allow) {
  const url = new URL(target)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('media URL must be http(s)')
  if (allow.length > 0 && !allow.includes(url.hostname)) {
    throw new Error(`media host ${url.hostname} is not allowed for this provider`)
  }
  return url.hostname
}

/**
 * Read a bounded body, failing instead of buffering an oversized stream.
 * @param {Response} response - fetch response.
 * @returns {Promise<Buffer>} bytes.
 */
async function readBounded(response) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES) {
    throw new Error(`attachment is too large (${declared} bytes)`)
  }
  if (response.body === null) return Buffer.alloc(0)
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    total += chunk.length
    if (total > MAX_ATTACHMENT_BYTES) throw new Error(`attachment is too large (>${MAX_ATTACHMENT_BYTES} bytes)`)
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Fetch bytes with a redirect-aware, size-bounded request.
 * @param {string} target - absolute URL.
 * @param {{headers?: Record<string,string>, timeoutMs: number, allowHosts?: Array<string>, fetchImpl: Function}} options - request options.
 * @returns {Promise<{bytes: Buffer, type: string, name: string}>} downloaded media.
 */
async function fetchBytes(target, options) {
  assertHost(target, options.allowHosts ?? [])
  const response = await options.fetchImpl(target, {
    headers: { accept: '*/*', ...(options.headers ?? {}) },
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs),
  })
  if (!response.ok) throw new Error(`provider answered HTTP ${response.status}`)
  const bytes = await readBounded(response)
  if (bytes.length === 0) throw new Error('provider returned an empty body')
  const type = String(response.headers.get('content-type') ?? '').split(';')[0].trim()
  const disposition = String(response.headers.get('content-disposition') ?? '')
  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/iu.exec(disposition)?.[1]
  let name = ''
  try {
    name = decodeURIComponent(new URL(target).pathname.split('/').pop() ?? '')
  } catch {
    name = ''
  }
  return { bytes, type, name: named !== undefined ? named : name }
}

/**
 * Resolve one WhatsApp Cloud media handle into a downloadable URL.
 * @param {Record<string, any>} channel - channel row.
 * @param {string} mediaId - provider media id.
 * @param {{fetchImpl: Function, timeoutMs: number, graphBase: string, graphHosts?: Array<string>}} options - transport.
 * @returns {Promise<{url: string, headers: Record<string,string>}>} resolved source.
 */
async function resolveWhatsAppMedia(channel, mediaId, options) {
  const config = channel.config ?? {}
  const token = typeof config.accessToken === 'string' ? config.accessToken : ''
  if (token === '') throw new Error('WhatsApp access token is not configured')
  const version = typeof config.graphVersion === 'string' && /^\d+\.\d+$/u.test(config.graphVersion)
    ? config.graphVersion
    : 'v18.0'
  const lookup = `${options.graphBase}/${version}/${encodeURIComponent(mediaId)}`
  assertHost(lookup, options.graphHosts ?? ['graph.facebook.com'])
  const response = await options.fetchImpl(lookup, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(options.timeoutMs),
  })
  if (!response.ok) throw new Error(`media lookup answered HTTP ${response.status}`)
  const payload = await response.json()
  const url = typeof payload?.url === 'string' ? payload.url : ''
  if (url === '') throw new Error('media lookup returned no download URL')
  return { url, headers: { authorization: `Bearer ${token}` } }
}

/**
 * Download and store one inbound attachment.
 * @param {Record<string, any>} channel - channel that received it.
 * @param {Record<string, any>} attachment - inbound descriptor.
 * @param {{fetchImpl?: Function, timeoutMs?: number, graphBase?: string}} [options] - transport overrides.
 * @returns {Promise<Record<string, any>>} the stored attachment descriptor.
 */
export async function persistOne(channel, attachment, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  const graphBase = options.graphBase ?? 'https://graph.facebook.com'
  const provider = String(channel?.type ?? '')
  let source
  if (typeof attachment.providerId === 'string' && attachment.providerId !== '') {
    if (provider !== 'whatsapp_cloud') throw new Error(`provider ${provider} cannot resolve a media handle`)
    source = await resolveWhatsAppMedia(channel, attachment.providerId, {
      fetchImpl,
      timeoutMs,
      graphBase,
      graphHosts: Array.isArray(options.graphHosts) ? options.graphHosts : undefined,
    })
    const media = await fetchBytes(source.url, {
      headers: source.headers,
      timeoutMs,
      allowHosts: Array.isArray(options.allowHosts) ? options.allowHosts : WHATSAPP_MEDIA_HOSTS,
      fetchImpl,
    })
    return saveAttachment(media.bytes, {
      name: attachment.name || media.name,
      type: attachment.type || media.type,
    })
  }
  if (typeof attachment.url !== 'string' || !/^https?:\/\//u.test(attachment.url)) {
    throw new Error('attachment has neither a media handle nor an http(s) URL')
  }
  // A bridge URL is operator-owned: it is where that bridge already stores the
  // file, so any host is acceptable. Official providers stay allowlisted above.
  const media = await fetchBytes(attachment.url, { timeoutMs, fetchImpl })
  return saveAttachment(media.bytes, {
    name: attachment.name || media.name,
    type: attachment.type || media.type,
  })
}

/**
 * Download every remote attachment of one stored message and rewrite it in
 * place. Runs outside the inbound serial queue so the provider webhook is
 * acknowledged immediately; the patch itself re-enters the queue.
 * @param {{store: Record<string, any>, serial: (task: () => Promise<unknown>) => Promise<unknown>, logger?: Record<string, any>}} runtime - plugin runtime.
 * @param {string} messageId - stored message id.
 * @param {{fetchImpl?: Function, timeoutMs?: number, graphBase?: string}} [options] - transport overrides.
 * @returns {Promise<{persisted: number, failed: number}>} outcome counts.
 */
export async function persistInboundMedia(runtime, messageId, options = {}) {
  const channelOf = () => {
    for (const conversation of runtime.store.state.conversations ?? []) {
      const message = (conversation.messages ?? []).find((item) => item.id === messageId)
      if (message !== undefined) {
        const channel = (runtime.store.state.channels ?? []).find((item) => item.id === conversation.channelId)
        return { message, channel }
      }
    }
    return { message: undefined, channel: undefined }
  }
  const { message, channel } = channelOf()
  if (message === undefined || channel === undefined) return { persisted: 0, failed: 0 }
  const targets = pendingOf(message)
  if (targets.length === 0) return { persisted: 0, failed: 0 }
  const settled = await Promise.allSettled(targets.map((attachment) => persistOne(channel, attachment, options)))
  const failure = (reason) => (reason instanceof Error ? reason.message : String(reason))
  let persisted = 0
  await runtime.serial(async () => {
    const current = channelOf().message
    if (current === undefined) return
    const attachments = Array.isArray(current.attachments) ? current.attachments : []
    let touched = false
    current.attachments = attachments.map((attachment) => {
      const index = targets.indexOf(attachment)
      if (index === -1) return attachment
      const result = settled[index]
      touched = true
      if (result.status === 'fulfilled') {
        persisted += 1
        return result.value
      }
      return { ...attachment, error: failure(result.reason) }
    })
    if (touched) await runtime.store.commit()
  })
  if (persisted === 0) {
    runtime.logger?.warn?.(`im-omni：${targets.length} 个入站附件未能转存`)
  }
  return { persisted, failed: targets.length - persisted }
}
