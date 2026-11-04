#!/usr/bin/env node
/**
 * DSH IM Bridge — reference companion for personal WhatsApp and WeChat.
 *
 * The DSH plugin cannot ship proprietary personal-account protocols. This
 * small HTTP service owns the WhatsApp (Baileys) or WeChat (Wechaty) session,
 * exposes the QR/status/send contract the plugin expects, and forwards inbound
 * messages to the channel callback.
 *
 * Required environment:
 *   IM_BRIDGE_KIND=whatsapp|wechat
 *   IM_BRIDGE_TOKEN=<token shown in the DSH channel setup>
 *   IM_OMNI_WEBHOOK=<callback URL shown in the DSH channel setup>
 *
 * Optional:
 *   IM_BRIDGE_PORT=8790
 *   IM_BRIDGE_SESSION=default
 *   IM_BRIDGE_STATE_DIR=.sessions
 *   WECHATY_PUPPET=wechaty-puppet-wechat4u
 *
 * Endpoints (all require Authorization: Bearer <IM_BRIDGE_TOKEN>):
 *   POST /session/start
 *   GET  /session/status?session=default
 *   GET  /session/qr?session=default
 *   POST /messages/send
 */
import http from 'node:http'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { timingSafeEqual } from 'node:crypto'

const KIND = process.env.IM_BRIDGE_KIND ?? 'whatsapp'
const TOKEN = process.env.IM_BRIDGE_TOKEN ?? ''
const WEBHOOK = process.env.IM_OMNI_WEBHOOK ?? ''
const PORT = Number(process.env.IM_BRIDGE_PORT) || 8790
const DEFAULT_SESSION = process.env.IM_BRIDGE_SESSION ?? 'default'
const STATE_DIR = path.resolve(process.env.IM_BRIDGE_STATE_DIR ?? '.sessions')
const MAX_BODY = 64 * 1024

if (TOKEN === '') {
  console.error('IM_BRIDGE_TOKEN is required.')
  process.exit(1)
}
if (WEBHOOK === '') console.warn('IM_OMNI_WEBHOOK is empty: inbound messages will only be logged.')

/** @typedef {'starting'|'waiting'|'scanning'|'connected'|'disconnected'|'error'} BridgeState */

/** Mutable state shared by the provider and HTTP handlers. */
const state = {
  /** @type {BridgeState} */
  status: 'starting',
  qrDataUrl: '',
  account: '',
  detail: '',
  updatedAt: new Date().toISOString(),
  /** @type {Map<string, any>} */
  contacts: new Map(),
  /** @type {Map<string, any>} */
  rooms: new Map(),
}

/** @type {Record<string, any> | null} */
let whatsapp = null
/** @type {Record<string, any> | null} */
let wechat = null
let reconnectTimer = null
let started = false

/**
 * Update public state.
 * @param {Partial<typeof state>} patch - fields.
 * @returns {void}
 */
function setState(patch) {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() })
}

/**
 * Render a QR string into a data URL.
 * @param {string} value - QR payload or URL.
 * @returns {Promise<string>} image data URL.
 */
async function qrDataUrl(value) {
  const qrcode = await import('qrcode')
  const module = qrcode.default ?? qrcode
  return module.toDataURL(value, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
}

/**
 * POST one inbound message to the configured DSH callback.
 * @param {Record<string, any>} message - generic inbound payload.
 * @returns {Promise<void>}
 */
async function forward(message) {
  if (WEBHOOK === '') {
    console.log('[inbound]', message)
    return
  }
  try {
    const response = await fetch(WEBHOOK, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        event: 'message.created',
        ...message,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.error(`[inbound] DSH responded ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
  } catch (error) {
    console.error('[inbound] delivery failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * Build the generic inbound payload.
 * @param {{conversationId:string,userId:string,messageId:string,text:string,contactName?:string,handle?:string,timestamp?:number}} message - fields.
 * @returns {Record<string, any>} payload.
 */
function inbound(message) {
  return {
    externalConversationId: message.conversationId,
    externalMessageId: message.messageId,
    contact: {
      id: message.userId,
      name: message.contactName ?? '',
      handle: message.handle ?? '',
    },
    message: { text: message.text, attachments: [] },
    timestamp: new Date((message.timestamp ?? Date.now()) * 1000).toISOString(),
  }
}

/**
 * Start the configured provider session once.
 * @returns {Promise<void>}
 */
async function startSession() {
  if (started) return
  started = true
  setState({ status: 'starting', detail: '' })
  try {
    if (KIND === 'wechat') await startWechat()
    else await startWhatsapp()
  } catch (error) {
    setState({ status: 'error', detail: error instanceof Error ? error.message : String(error) })
    started = false
    throw error
  }
}

/**
 * Start a Baileys WhatsApp session.
 * @returns {Promise<void>}
 */
async function startWhatsapp() {
  const baileys = await import('baileys')
  const makeWASocket = baileys.default ?? baileys.makeWASocket
  if (typeof makeWASocket !== 'function') throw new Error('baileys did not export makeWASocket')
  const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys
  await mkdir(path.join(STATE_DIR, 'whatsapp'), { recursive: true, mode: 0o700 })
  const { state: authState, saveCreds } = await useMultiFileAuthState(path.join(STATE_DIR, 'whatsapp'))
  const version = typeof fetchLatestBaileysVersion === 'function'
    ? (await fetchLatestBaileysVersion()).version
    : undefined
  const sock = makeWASocket({
    auth: authState,
    version,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })
  whatsapp = sock
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    if (typeof qr === 'string' && qr !== '') {
      try {
        setState({ status: 'waiting', qrDataUrl: await qrDataUrl(qr), detail: 'Scan with WhatsApp → Linked devices.' })
      } catch (error) {
        setState({ status: 'error', detail: `QR render failed: ${error instanceof Error ? error.message : error}` })
      }
    }
    if (connection === 'open') {
      const id = sock.user?.id ?? ''
      setState({ status: 'connected', qrDataUrl: '', account: id.split(':')[0] || id, detail: '' })
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      setState({ status: 'disconnected', qrDataUrl: '', detail: `Connection closed (${statusCode ?? 'unknown'}).` })
      if (statusCode !== DisconnectReason?.loggedOut && statusCode !== 401) {
        clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(() => {
          started = false
          startSession().catch((error) => console.error('WhatsApp reconnect failed:', error))
        }, 3_000)
      }
    }
  })
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      if (message?.key?.fromMe) continue
      const jid = message?.key?.remoteJid ?? ''
      if (jid === '' || jid === 'status@broadcast') continue
      const body = message?.message?.conversation
        ?? message?.message?.extendedTextMessage?.text
        ?? message?.message?.imageMessage?.caption
        ?? message?.message?.videoMessage?.caption
        ?? (message?.message?.imageMessage !== undefined ? '[image]' : '')
        ?? ''
      if (String(body).trim() === '') continue
      const sender = message?.key?.participant ?? jid
      const timestamp = Number(message?.messageTimestamp) || Math.floor(Date.now() / 1000)
      await forward(inbound({
        conversationId: jid,
        userId: sender,
        messageId: message?.key?.id ?? `wa_${Date.now()}`,
        text: String(body).slice(0, 8000),
        contactName: message?.pushName ?? '',
        handle: sender,
        timestamp,
      }))
    }
  })
}

/**
 * Start a Wechaty session.
 * @returns {Promise<void>}
 */
async function startWechat() {
  const wechaty = await import('wechaty')
  const { WechatyBuilder } = wechaty
  if (typeof WechatyBuilder?.build !== 'function') throw new Error('wechaty did not export WechatyBuilder')
  await mkdir(path.join(STATE_DIR, 'wechat'), { recursive: true, mode: 0o700 })
  const bot = WechatyBuilder.build({
    name: path.join(STATE_DIR, 'wechat', 'session'),
    puppet: process.env.WECHATY_PUPPET || undefined,
  })
  wechat = bot
  bot.on('scan', async (qrcode, status) => {
    setState({ status: status === 2 ? 'scanning' : 'waiting', detail: 'Scan with WeChat.' })
    if (typeof qrcode === 'string' && qrcode !== '') {
      try {
        const payload = qrcode.startsWith('http') ? qrcode : `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`
        setState({ qrDataUrl: await qrDataUrl(payload) })
      } catch (error) {
        setState({ status: 'error', detail: `QR render failed: ${error instanceof Error ? error.message : error}` })
      }
    }
  })
  bot.on('login', (user) => {
    setState({ status: 'connected', qrDataUrl: '', account: user.name(), detail: '' })
  })
  bot.on('logout', (user) => {
    setState({ status: 'disconnected', qrDataUrl: '', account: '', detail: `${user.name()} logged out.` })
  })
  bot.on('error', (error) => {
    setState({ status: 'error', detail: error instanceof Error ? error.message : String(error) })
  })
  bot.on('message', async (message) => {
    try {
      if (message.self()) return
      const text = message.text()
      if (!text || !text.trim()) return
      const talker = message.talker()
      const room = message.room()
      const conversationId = room ? room.id : talker.id
      state.contacts.set(talker.id, talker)
      if (room) state.rooms.set(room.id, room)
      await forward(inbound({
        conversationId,
        userId: talker.id,
        messageId: message.id,
        text: text.slice(0, 8000),
        contactName: talker.name(),
        handle: talker.id,
        timestamp: Math.floor(Date.now() / 1000),
      }))
    } catch (error) {
      console.error('WeChat message handling failed:', error)
    }
  })
  await bot.start()
}

/**
 * Send text through the active provider.
 * @param {string} to - WhatsApp JID or WeChat contact/room id.
 * @param {string} text - body.
 * @returns {Promise<string>} provider message id or empty.
 */
async function sendText(to, text) {
  if (KIND === 'wechat') {
    const room = state.rooms.get(to)
    if (room) {
      await room.say(text)
      return ''
    }
    const contact = state.contacts.get(to)
    if (contact) {
      await contact.say(text)
      return ''
    }
    throw new Error('Unknown WeChat contact or room. Receive a message from it first.')
  }
  if (whatsapp === null) throw new Error('WhatsApp session is not running.')
  const result = await whatsapp.sendMessage(to, { text })
  return result?.key?.id ?? ''
}

/**
 * Read and parse a JSON request body.
 * @param {import('node:http').IncomingMessage} request - request.
 * @returns {Promise<Record<string, any>>} body.
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Request body is too large.'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw === '') return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Request body is not valid JSON.'))
      }
    })
    request.on('error', reject)
  })
}

/**
 * Constant-time bearer check.
 * @param {import('node:http').IncomingHttpHeaders} headers - headers.
 * @returns {boolean} authorized.
 */
function authorized(headers) {
  const raw = headers.authorization ?? ''
  const supplied = raw.startsWith('Bearer ') ? raw.slice(7) : ''
  const a = Buffer.from(supplied)
  const b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** @param {import('node:http').ServerResponse} response - response. */
function json(response, status, body) {
  const encoded = JSON.stringify(body)
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded), 'cache-control': 'no-store' })
  response.end(encoded)
}

/** @param {string} value - text. */
function clip(value) {
  return typeof value === 'string' ? value.slice(0, 8000) : ''
}

const server = http.createServer(async (request, response) => {
  try {
    if (!authorized(request.headers)) return json(response, 401, { ok: false, error: 'unauthorized' })
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (request.method === 'GET' && url.pathname === '/session/status') {
      return json(response, 200, { status: state.status, qrDataUrl: state.status === 'waiting' ? state.qrDataUrl : '', account: state.account, detail: state.detail, updatedAt: state.updatedAt })
    }
    if (request.method === 'GET' && url.pathname === '/session/qr') {
      return json(response, 200, { status: state.status, qrDataUrl: state.qrDataUrl, account: state.account, detail: state.detail, updatedAt: state.updatedAt })
    }
    if (request.method === 'POST' && url.pathname === '/session/start') {
      await readBody(request)
      try {
        await startSession()
      } catch (error) {
        return json(response, 502, { status: 'error', detail: error instanceof Error ? error.message : String(error) })
      }
      return json(response, 200, { status: state.status, qrDataUrl: state.qrDataUrl, account: state.account, detail: state.detail, updatedAt: state.updatedAt })
    }
    if (request.method === 'POST' && url.pathname === '/messages/send') {
      const body = await readBody(request)
      const to = typeof body.to === 'string' ? body.to : ''
      const text = clip(body.text)
      if (to === '' || text === '') return json(response, 400, { ok: false, error: 'to and text are required' })
      try {
        const id = await sendText(to, text)
        return json(response, 200, { ok: true, id })
      } catch (error) {
        return json(response, 502, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { ok: true, kind: KIND, status: state.status })
    }
    return json(response, 404, { ok: false, error: 'not found' })
  } catch (error) {
    return json(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`DSH IM Bridge (${KIND}) listening on http://127.0.0.1:${PORT}`)
  startSession().catch((error) => console.error('Session start failed:', error))
})

/** Stop the bridge cleanly. */
async function shutdown() {
  clearTimeout(reconnectTimer)
  try {
    await whatsapp?.end?.(undefined)
  } catch {
    // Ignore.
  }
  try {
    await wechat?.stop?.()
  } catch {
    // Ignore.
  }
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
