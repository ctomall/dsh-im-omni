/**
 * IM omnichannel Host half.
 *
 * Owns the durable workspace document, the authenticated browser API, the
 * public provider callbacks, queued outbound delivery, long-lived Telegram and
 * Discord workers, and scheduled broadcasts. The Client half renders the
 * sidebar entry and the full page.
 * @module dsh-im-omni
 */
import { Store, publicState } from './lib/store.js'
import { executeCommand, handleInbound, processDueBroadcasts, handoffBot, markBotHandled, replyAsBot } from './lib/commands.js'
import { handleWebhook } from './lib/channels/index.js'
import { ChannelRuntime } from './lib/channels/runtime.js'
import { createIntelligence } from './lib/intelligence.js'
import { ReceptionBot } from './lib/bot.js'
import { APK_PATH, VERSION_PATH, apkResponse, versionResponse } from './lib/app.js'
import { UpgradeError, applyUpgrade, checkUpgrade } from './lib/upgrade.js'
import {
  MAX_ATTACHMENT_BYTES,
  configureAttachments,
  pruneAttachments,
  readAttachment,
  saveAttachment,
} from './lib/attachments.js'
import {
  ApiError,
  createSerial,
  failureOf,
  json,
  readRequestBody,
  text,
  writeJson,
} from './lib/util.js'

/** Browser API for reading the workspace. */
const STATE_PATH = '/api/im-omni.state'
/** Browser API for serialized commands. */
const COMMAND_PATH = '/api/im-omni.command'
/** Browser API for translation and AI assistance. */
const INTELLIGENCE_PATH = '/api/im-omni.ai'
/** Owner API for the plugin's own Git update. */
const UPGRADE_PATH = '/api/im-omni.upgrade'
/** Owner API for uploading one attachment. */
const UPLOAD_PATH = '/api/im-omni.upload'
/** Owner API for reading one attachment back. */
const ATTACHMENT_PATH = '/api/im-omni.attachment'
/** Public callback prefix, including the trailing slash used to read the channel id. */
const WEBHOOK_PREFIX = '/api/im-omni.webhook/'
/** Registered prefix route: the webserver matches `${path}/...`, so this form has no trailing slash. */
const WEBHOOK_ROUTE = '/api/im-omni.webhook'
/** Inbound request limit. */
const MAX_WEBHOOK_BYTES = 262_144
/** Inbound requests allowed per channel per minute. */
const RATE_LIMIT = 120

/** Required Host services. */
export const inject = ['connection', 'webServer']

/**
 * A tiny fixed-window limiter kept in Host memory.
 * @returns {(key:string) => boolean} true when the key is over the limit.
 */
function createRateLimiter() {
  const buckets = new Map()
  return (key) => {
    const now = Date.now()
    const bucket = buckets.get(key)
    if (bucket === undefined || now - bucket.startedAt >= 60_000) {
      buckets.set(key, { startedAt: now, count: 1 })
      if (buckets.size > 1_000) {
        for (const [candidate, value] of buckets) {
          if (now - value.startedAt >= 60_000) buckets.delete(candidate)
        }
      }
      return false
    }
    bucket.count += 1
    return bucket.count > RATE_LIMIT
  }
}

/**
 * Write an adapter response, which may be plain text (verification challenges)
 * or JSON (event acknowledgements).
 * @param {import('node:http').ServerResponse} response - response.
 * @param {number} status - HTTP status.
 * @param {unknown} body - object or string.
 * @param {Record<string,string>} [headers] - content headers.
 * @returns {void}
 */
function writeAdapterResponse(response, status, body, headers = {}) {
  if (typeof body === 'string') {
    const encoded = body
    response.writeHead(status, {
      'content-type': 'text/plain; charset=utf-8',
      'content-length': Buffer.byteLength(encoded),
      'cache-control': 'no-store',
      ...headers,
    })
    response.end(encoded)
    return
  }
  writeJson(response, status, body)
}

/**
 * Handle one public provider callback.
 * @param {import('node:http').IncomingMessage} request - request.
 * @param {import('node:http').ServerResponse} response - response.
 * @param {Record<string, any>} runtime - store, serial executor, and workers.
 * @param {(key:string) => boolean} limited - rate limiter.
 * @returns {Promise<void>}
 */
async function handleWebhookRequest(request, response, runtime, limited) {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(WEBHOOK_PREFIX)) {
      writeJson(response, 404, { ok: false, error: { code: 'not-found', message: 'Unknown callback path.' } })
      return
    }
    const encoded = url.pathname.slice(WEBHOOK_PREFIX.length)
    const channelId = decodeURIComponent(encoded.split('/')[0] ?? '')
    if (channelId === '') {
      writeJson(response, 404, { ok: false, error: { code: 'not-found', message: 'A channel id is required.' } })
      return
    }
    if (limited(channelId)) {
      writeJson(response, 429, { ok: false, error: { code: 'rate-limited', message: 'Too many callback events. Retry in a minute.' } })
      return
    }
    const channel = runtime.store.state.channels.find((item) => item.id === channelId)
    if (channel === undefined) {
      writeJson(response, 404, { ok: false, error: { code: 'channel-not-found', message: 'Channel not found.' } })
      return
    }
    const method = request.method ?? 'GET'
    if (method !== 'GET' && method !== 'POST') {
      writeJson(response, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET or POST.' } })
      return
    }
    const rawBody = method === 'POST' ? await readRequestBody(request, MAX_WEBHOOK_BYTES) : ''
    const outcome = await handleWebhook(channel, {
      method,
      url,
      headers: request.headers,
      rawBody,
    })
    const events = Array.isArray(outcome.events) ? outcome.events : []
    const receipts = []
    for (const event of events) {
      receipts.push(await handleInbound(runtime, channelId, event))
    }
    let body = outcome.body
    if (events.length > 0 && body !== null && typeof body === 'object' && !Array.isArray(body)) {
      body = {
        ...body,
        received: receipts.length,
        duplicate: receipts.some((receipt) => receipt.duplicate === true),
        ...(receipts.length === 1 ? receipts[0] : {}),
        ...(receipts.length > 1 ? { receipts } : {}),
      }
    }
    writeAdapterResponse(response, outcome.status ?? (events.length > 0 ? 202 : 200), body, outcome.headers)
  } catch (error) {
    const failure = failureOf(error)
    if (!response.headersSent) {
      writeJson(response, failure.status, { ok: false, error: { code: failure.code, message: failure.message } })
    } else if (!response.writableEnded) {
      response.end()
    }
  }
}

/**
 * Register the API, provider callbacks, workers, and scheduler for this profile.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Host context.
 */
export async function apply(ctx) {
  const store = new Store()
  await store.load()
  configureAttachments(store.file)
  const serial = createSerial()
  const runtime = { store, serial }
  runtime.ingest = (channelId, payload) => handleInbound(runtime, channelId, payload)
  runtime.intelligence = createIntelligence(ctx)
  runtime.replyAsBot = (conversationId, body, model) => replyAsBot(runtime, conversationId, body, model)
  runtime.handoffBot = (conversationId, reason) => handoffBot(runtime, conversationId, reason)
  runtime.markBotHandled = (conversationId, messageId) => markBotHandled(runtime, conversationId, messageId)
  const receptionBot = new ReceptionBot(runtime, runtime.intelligence, (message) => {
    if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
    else console.warn(`[im-omni] ${message}`)
  })
  runtime.bot = receptionBot
  const limited = createRateLimiter()
  const workers = new ChannelRuntime({
    store,
    ingest: (channelId, payload) => handleInbound(runtime, channelId, payload),
    log: (message) => {
      if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
      else console.warn(`[im-omni] ${message}`)
    },
  })
  runtime.channels = workers

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: STATE_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => json({ ok: true, state: publicState(store.state, store.file) }),
    }),
    'im-omni: state route',
  )

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: COMMAND_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: { code: 'bad-json', message: 'The request body is not valid JSON.' } }, 400)
        }
        const action = text(body?.action, 80)
        if (action === '') {
          return json({ ok: false, error: { code: 'missing-action', message: 'A command action is required.' } }, 400)
        }
        try {
          const outcome = await serial(() => executeCommand(runtime, action, body?.payload ?? body))
          return json({ ok: true, state: publicState(store.state, store.file), result: outcome.result ?? {} })
        } catch (error) {
          const failure = failureOf(error)
          return json({ ok: false, error: { code: failure.code, message: failure.message }, state: publicState(store.state, store.file) }, failure.status)
        }
      },
    }),
    'im-omni: command route',
  )

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: INTELLIGENCE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: { code: 'bad-json', message: 'The request body is not valid JSON.' } }, 400)
        }
        const action = text(body?.action, 80)
        const payload = body?.payload ?? body ?? {}
        try {
          let result
          if (action === 'capabilities') result = await runtime.intelligence.capabilities()
          else if (action === 'translateText') result = await runtime.intelligence.translateText(payload.text, payload.targetLanguage, payload.sourceLanguage)
          else if (action === 'translateConversation') result = await runtime.intelligence.translateConversation(runtime, text(payload.conversationId, 100), payload.targetLanguage)
          else if (action === 'suggest') result = await runtime.intelligence.suggestReplies(runtime, text(payload.conversationId, 100), payload.targetLanguage, text(payload.hint, 500))
          else return json({ ok: false, error: { code: 'unknown-action', message: `Unknown intelligence action "${action}".` } }, 404)
          return json({ ok: true, result, state: action === 'translateConversation' ? publicState(store.state, store.file) : undefined })
        } catch (error) {
          const failure = failureOf(error)
          return json({ ok: false, error: { code: failure.code, message: failure.message } }, failure.status)
        }
      },
    }),
    'im-omni: intelligence route',
  )

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: UPLOAD_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let bytes
        try {
          bytes = Buffer.from(await request.arrayBuffer())
        } catch {
          return json({ ok: false, error: { code: 'bad-body', message: 'The attachment body could not be read.' } }, 400)
        }
        if (bytes.length === 0) {
          return json({ ok: false, error: { code: 'empty-file', message: 'The upload was empty.' } }, 400)
        }
        if (bytes.length > MAX_ATTACHMENT_BYTES) {
          return json({ ok: false, error: { code: 'file-too-large', message: `Attachments are limited to ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.` } }, 413)
        }
        try {
          const name = decodeURIComponent(request.headers.get('x-file-name') ?? '') || 'attachment'
          const type = request.headers.get('content-type') ?? 'application/octet-stream'
          const attachment = await saveAttachment(bytes, { name, type })
          return json({ ok: true, result: { attachment } })
        } catch (error) {
          const failure = failureOf(error)
          return json({ ok: false, error: { code: failure.code, message: failure.message } }, failure.status)
        }
      },
    }),
    'im-omni: attachment upload',
  )

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: ATTACHMENT_PATH,
      methods: ['GET', 'HEAD'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const id = new URL(request.url).searchParams.get('id') ?? ''
        const found = await readAttachment(id)
        if (found === null) {
          return json({ ok: false, error: { code: 'attachment-not-found', message: 'No such attachment.' } }, 404)
        }
        const headers = {
          'content-type': found.record.type,
          'content-length': String(found.bytes.length),
          'cache-control': 'private, max-age=600',
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(found.record.name)}`,
        }
        if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
        return new Response(found.bytes, { status: 200, headers })
      },
    }),
    'im-omni: attachment download',
  )

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: UPGRADE_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: { code: 'bad-json', message: 'The request body is not valid JSON.' } }, 400)
        }
        const action = text(body?.action, 20)
        try {
          if (action === 'check') return json({ ok: true, result: { status: await checkUpgrade() } })
          if (action === 'pull') {
            const result = await applyUpgrade()
            if (result.changed === true) {
              store.event('plugin.upgraded', `插件更新 ${result.before?.short ?? '?'} → ${result.after?.short ?? '?'}`, {
                actorId: store.state.workspace.currentAgentId ?? null,
              })
              store.state.meta = { ...store.state.meta, revision: (Number(store.state.meta?.revision) || 0) + 1 }
              await store.commit({ bumpRevision: false })
            }
            return json({ ok: true, result })
          }
          return json({ ok: false, error: { code: 'unknown-action', message: 'Action must be "check" or "pull".' } }, 400)
        } catch (error) {
          if (error instanceof UpgradeError) {
            return json({ ok: false, error: { code: error.code, message: error.message } }, error.status)
          }
          const failure = failureOf(error)
          return json({ ok: false, error: { code: failure.code, message: failure.message } }, failure.status)
        }
      },
    }),
    'im-omni: plugin self-upgrade',
  )

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: VERSION_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => versionResponse(),
    }),
    'im-omni: android update manifest',
  )

  ctx.effect(
    () => ctx.connection.fetch.register({
      path: APK_PATH,
      methods: ['GET', 'HEAD'],
      requestBody: 'buffered',
      fetch: async (request) => apkResponse(request),
    }),
    'im-omni: android apk download',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: WEBHOOK_ROUTE,
      handler: (request, response) => handleWebhookRequest(request, response, runtime, limited),
    }),
    'im-omni: provider callback route',
  )

  ctx.effect(() => {
    // Referenced bytes are never deleted; this only reclaims orphans and the
    // old end of the store, so the attachments directory cannot grow forever.
    let running = false
    const sweep = async () => {
      if (running) return
      running = true
      try {
        const summary = await pruneAttachments(store.state)
        if (summary.removed > 0) {
          ctx.logger?.info?.(`IM attachments pruned: ${summary.removed} files, ${summary.freedBytes} bytes`)
        }
      } catch (error) {
        ctx.logger?.warn?.(`IM attachment pruning failed: ${error instanceof Error ? error.message : String(error)}`)
      } finally {
        running = false
      }
    }
    const initial = setTimeout(() => { void sweep() }, 60_000)
    const timer = setInterval(() => { void sweep() }, 6 * 60 * 60 * 1000)
    return () => {
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, 'im-omni: attachment retention')

  ctx.effect(() => {
    workers.sync()
    return () => {
      workers.stop()
      receptionBot.stop()
    }
  }, 'im-omni: Telegram and Discord workers')

  ctx.effect(() => {
    let running = false
    const tick = async () => {
      if (running) return
      running = true
      try {
        await processDueBroadcasts(runtime)
      } catch (error) {
        console.error('[im-omni] scheduled broadcast tick failed:', error)
      } finally {
        running = false
      }
    }
    const interval = setInterval(() => { void tick() }, 30_000)
    const initial = setTimeout(() => { void tick() }, 4_000)
    return () => {
      clearInterval(interval)
      clearTimeout(initial)
    }
  }, 'im-omni: broadcast scheduler')

  ctx.logger?.info?.(`IM omnichannel ready with ${store.state.channels.length} channel(s)`)
}
