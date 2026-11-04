/**
 * Embedded WhatsApp personal session.
 *
 * This is the default mode for the WhatsApp QR channel: the Host itself owns a
 * Baileys socket, renders the QR to a data URL, and receives messages without
 * a second HTTP process. An external bridge remains available for deployments
 * that need to keep the WhatsApp session on a different machine.
 * @module dsh-im-omni/lib/channels/whatsapp-embedded
 */
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { inboundPayload, mediaPlaceholder } from './common.js'
import { attachmentBytes, isLocalAttachment, mediaKind, saveAttachment } from '../attachments.js'

/** Avoid noisy Baileys JSON logs in the DSH Host log. */
const silentLogger = {
  level: 'silent',
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  child() { return silentLogger },
}

/** @type {Map<string, Record<string, any>>} */
const sessions = new Map()

/**
 * Resolve the per-channel auth directory.
 * @param {Record<string, any>} runtime - Host runtime with store.
 * @param {string} channelId - channel id.
 * @returns {string} absolute directory.
 */
function authDirectory(runtime, channelId) {
  const base = path.dirname(runtime.store.file)
  return path.join(base, 'whatsapp-auth', channelId)
}

/**
 * Wait until a predicate is true or the timeout expires.
 * @param {Record<string, any>} session - session.
 * @param {() => boolean} predicate - completion.
 * @param {number} [timeout=12_000] - milliseconds.
 * @returns {Promise<boolean>} whether it completed.
 */
function waitFor(session, predicate, timeout = 12_000) {
  if (predicate()) return Promise.resolve(true)
  return new Promise((resolve) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve(true)
      } else if (Date.now() - started >= timeout) {
        clearInterval(timer)
        resolve(false)
      }
    }, 100)
  })
}

/**
 * Extract a text body from a Baileys message.
 * @param {Record<string, any>} message - message content.
 * @returns {string} body.
 */
function bodyOf(message) {
  const content = message?.message ?? {}
  return content.conversation
    ?? content.extendedTextMessage?.text
    ?? content.imageMessage?.caption
    ?? content.videoMessage?.caption
    ?? content.documentMessage?.caption
    ?? (content.imageMessage !== undefined ? mediaPlaceholder('image') : '')
    ?? (content.videoMessage !== undefined ? mediaPlaceholder('video') : '')
    ?? (content.audioMessage !== undefined ? mediaPlaceholder('audio') : '')
    ?? (content.documentMessage !== undefined ? mediaPlaceholder('document') : '')
    ?? (content.stickerMessage !== undefined ? mediaPlaceholder('sticker') : '')
    ?? ''
}

/**
 * Open (or reuse) one embedded session.
 * @param {Record<string, any>} channel - channel record.
 * @param {{store: Record<string, any>, ingest: (channelId:string,payload:Record<string,any>)=>Promise<unknown>}} runtime - Host runtime.
 * @returns {Promise<Record<string, any>>} session state.
 */
export async function ensure(channel, runtime) {
  const existing = sessions.get(channel.id)
  if (existing !== undefined) {
    existing.runtime = runtime
    return existing
  }
  const session = {
    channelId: channel.id,
    channel,
    runtime,
    status: 'starting',
    qrDataUrl: '',
    account: '',
    detail: '',
    updatedAt: new Date().toISOString(),
    sock: null,
    starting: null,
    stopped: false,
    reconnectTimer: null,
  }
  sessions.set(channel.id, session)
  session.starting = open(session)
  await session.starting
  return session
}

/**
 * Create the Baileys socket for a session.
 * @param {Record<string, any>} session - session.
 * @returns {Promise<void>} readiness.
 */
async function open(session) {
  if (session.stopped) return
  let baileys
  let QRCode
  try {
    baileys = await import('baileys')
    QRCode = (await import('qrcode')).default
  } catch (error) {
    session.status = 'error'
    session.detail = `WhatsApp engine is not installed: ${error instanceof Error ? error.message : String(error)}`
    session.updatedAt = new Date().toISOString()
    return
  }
  session.baileys = baileys
  const makeWASocket = baileys.default ?? baileys.makeWASocket
  const { useMultiFileAuthState, DisconnectReason } = baileys
  const directory = authDirectory(session.runtime, session.channelId)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  try {
    const { state, saveCreds } = await useMultiFileAuthState(directory)
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      logger: silentLogger,
    })
    session.sock = sock
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', async (update) => {
      if (session.stopped) return
      const { connection, lastDisconnect, qr } = update
      if (typeof qr === 'string' && qr !== '') {
        try {
          session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
          session.status = 'waiting'
          session.detail = ''
        } catch (error) {
          session.status = 'error'
          session.detail = `QR render failed: ${error instanceof Error ? error.message : String(error)}`
        }
        session.updatedAt = new Date().toISOString()
      }
      if (connection === 'open') {
        const id = sock.user?.jid || sock.user?.id || ''
        session.status = 'connected'
        const idText = String(id)
        session.account = idText.includes('@lid') ? '' : idText.split('@')[0].split(':')[0]
        session.qrDataUrl = ''
        session.detail = ''
        session.updatedAt = new Date().toISOString()
      } else if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
        session.status = 'disconnected'
        session.qrDataUrl = ''
        session.detail = `Connection closed (${code ?? 'unknown'}).`
        session.updatedAt = new Date().toISOString()
        if (code !== DisconnectReason?.loggedOut && code !== 401 && !session.stopped) {
          clearTimeout(session.reconnectTimer)
          session.reconnectTimer = setTimeout(() => {
            if (session.stopped) return
            session.status = 'starting'
            session.starting = open(session).catch((error) => {
              session.status = 'error'
              session.detail = error instanceof Error ? error.message : String(error)
            })
          }, 3_000)
        }
      }
    })
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (session.stopped || type !== 'notify') return
      for (const message of messages) {
        try {
          if (message?.key?.fromMe) continue
          const jid = message?.key?.remoteJid ?? ''
          if (jid === '' || jid === 'status@broadcast') continue
          const body = bodyOf(message)
          if (String(body).trim() === '') continue
          const key = message?.key ?? {}
          const isGroup = jid.endsWith('@g.us')
          const phoneJid = key.senderPn || (isGroup ? key.participantPn : '')
          const lidJid = key.senderLid || (isGroup ? key.participant : jid)
          const sender = phoneJid || lidJid || jid
          const alternateUserId = phoneJid !== '' && lidJid !== '' && phoneJid !== lidJid ? lidJid : ''
          const phone = phoneJid === '' ? '' : String(phoneJid).split('@')[0].split(':')[0]
          const attachments = await saveInboundMedia(message, session)
          await session.runtime.ingest(session.channelId, inboundPayload({
            attachments,
            conversationId: jid,
            userId: sender,
            alternateUserId,
            messageId: key.id ?? `wa_${Date.now()}`,
            text: String(body).slice(0, 8000),
            contactName: message?.pushName ?? '',
            handle: phone,
            phone,
            timestamp: Number(message?.messageTimestamp) || Date.now() / 1000,
            attachments: [],
            replyContext: { waId: jid, phoneJid },
          }))
        } catch (error) {
          console.error('[im-omni] embedded WhatsApp ingest failed:', error)
        }
      }
    })
    await waitFor(session, () => session.status === 'waiting' || session.status === 'connected' || session.status === 'error', 8_000)
  } catch (error) {
    session.status = 'error'
    session.detail = error instanceof Error ? error.message : String(error)
    session.updatedAt = new Date().toISOString()
  }
}

/**
 * Read current session state; start on demand when auth exists or requested.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} runtime - Host runtime.
 * @returns {Promise<Record<string, any>>} status.
 */
export async function qr(channel, runtime) {
  const session = await ensure(channel, runtime)
  await waitFor(session, () => session.status === 'waiting' || session.status === 'connected' || session.status === 'error', 12_000)
  return statusOf(session)
}

/**
 * Read current status.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<Record<string, any>>} status.
 */
export async function status(channel) {
  const session = sessions.get(channel.id)
  if (session === undefined) {
    return { ok: true, status: 'disconnected', qrDataUrl: '', account: '', detail: 'Open QR login to start the session.', updatedAt: '' }
  }
  return statusOf(session)
}

/**
 * Map a session to the adapter response.
 * @param {Record<string, any>} session - session.
 * @returns {Record<string, any>} status.
 */
function statusOf(session) {
  return {
    ok: session.status !== 'error',
    status: session.status,
    qrDataUrl: session.status === 'waiting' ? session.qrDataUrl : '',
    account: session.account,
    detail: session.detail,
    updatedAt: session.updatedAt,
  }
}

/**
 * Send a text through the embedded socket.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const session = sessions.get(channel.id)
  if (session === undefined || session.status !== 'connected' || session.sock === null) {
    return { ok: false, error: 'WhatsApp is not connected. Open QR login and scan first.' }
  }
  const target = conversation.externalId
  const caption = text(message.text, 8000)
  const attachments = Array.isArray(message.attachments) ? message.attachments : []
  try {
    let lastId = ''
    for (const attachment of attachments) {
      const payload = await mediaPayload(attachment, caption)
      if (payload === null) continue
      const sent = await session.sock.sendMessage(target, payload)
      lastId = sent?.key?.id ?? lastId
    }
    if (attachments.length === 0 || caption !== '') {
      const sent = await session.sock.sendMessage(target, { text: caption })
      lastId = sent?.key?.id ?? lastId
    }
    return { ok: true, error: '', externalId: lastId }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Build the Baileys payload for one attachment, reading local bytes when the
 * file lives in this Host and passing a URL through otherwise.
 * @param {Record<string,any>} attachment - descriptor.
 * @param {string} caption - text to attach to the first media item.
 * @returns {Promise<Record<string,any>|null>} payload, or null when unreadable.
 */
async function mediaPayload(attachment, caption) {
  const kind = mediaKind(attachment)
  const mimetype = text(attachment?.type, 120) || 'application/octet-stream'
  const fileName = text(attachment?.name, 120) || 'attachment'
  let source
  if (isLocalAttachment(attachment)) {
    const bytes = await attachmentBytes(attachment.id)
    if (bytes === null) return null
    source = bytes
  } else if (typeof attachment?.url === 'string' && attachment.url.startsWith('http')) {
    source = { url: attachment.url }
  } else {
    return null
  }
  if (kind === 'image') return { image: source, caption, mimetype }
  if (kind === 'video') return { video: source, caption, mimetype }
  if (kind === 'audio') return { audio: source, mimetype, ptt: false }
  return { document: source, fileName, mimetype, caption }
}

/**
 * Download one inbound media message into the attachment store.
 * @param {Record<string,any>} message - Baileys message.
 * @param {Record<string,any>} session - session.
 * @returns {Promise<Array<Record<string,any>>>} stored descriptors.
 */
async function saveInboundMedia(message, session) {
  const content = message?.message ?? {}
  const media = content.imageMessage ?? content.videoMessage ?? content.audioMessage
    ?? content.documentMessage ?? content.stickerMessage
  if (media === undefined || media === null) return []
  const download = session.baileys?.downloadMediaMessage
  if (typeof download !== 'function') return []
  try {
    const buffer = await download(message, 'buffer', {}, {
      logger: silentLogger,
      reuploadRequest: session.sock?.updateMediaMessage,
    })
    if (buffer === undefined || buffer === null) return []
    const kind = content.imageMessage ? 'image' : content.videoMessage ? 'video' : content.audioMessage ? 'audio' : content.stickerMessage ? 'sticker' : 'document'
    return [await saveAttachment(Buffer.from(buffer), {
      name: text(media.fileName, 120) || `whatsapp-${kind}`,
      type: text(media.mimetype, 120) || 'application/octet-stream',
    })]
  } catch {
    return []
  }
}

/**
 * Probe and start the embedded session.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} runtime - Host runtime.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel, runtime) {
  const result = await qr(channel, runtime)
  if (result.status === 'error') return { ok: false, detail: result.detail }
  return {
    ok: true,
    detail: result.status === 'connected'
      ? `Connected as ${result.account || 'WhatsApp account'}.`
      : 'Session started; scan the QR code to finish login.',
    account: result.account || undefined,
  }
}

/**
 * Stop one embedded session.
 * @param {string} channelId - channel id.
 * @returns {void}
 */
export function stop(channelId) {
  const session = sessions.get(channelId)
  if (session === undefined) return
  session.stopped = true
  clearTimeout(session.reconnectTimer)
  try {
    void session.sock?.end?.(undefined)
  } catch {
    // The socket may already be closed.
  }
  sessions.delete(channelId)
}

/** Stop every embedded session. */
export function stopAll() {
  for (const id of [...sessions.keys()]) stop(id)
}
