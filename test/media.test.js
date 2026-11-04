/**
 * Inbound media persistence: provider handles and private bridge URLs are
 * downloaded once, stored, and replaced by a local attachment descriptor.
 * Failure must never drop the message — it keeps the provider fields plus an
 * error string.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store } from '../lib/store.js'
import { configureAttachments } from '../lib/attachments.js'
import { executeCommand, handleInbound } from '../lib/commands.js'
import { createSerial } from '../lib/util.js'
import { persistInboundMedia, pendingOf } from '../lib/media.js'

/** 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * Serve the fixtures the tests need.
 * @param {http.ServerResponse} response - response.
 * @param {number} status - status code.
 * @param {Record<string,string>} headers - headers.
 * @param {Buffer} body - body.
 */
function send(response, status, headers, body) {
  response.writeHead(status, headers)
  response.end(body)
}

/**
 * Boot one local provider stand-in.
 * @returns {Promise<{base: string, close: () => Promise<void>}>} server facts.
 */
async function provider() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/file.png') {
      send(response, 200, { 'content-type': 'image/png', 'content-length': String(PNG.length) }, PNG)
      return
    }
    if (url.pathname === '/doc.txt') {
      send(response, 200, { 'content-type': 'text/plain', 'content-length': '5' }, Buffer.from('hello'))
      return
    }
    if (url.pathname === '/huge.bin') {
      // Declared length must be enough to refuse before buffering the stream.
      send(response, 200, { 'content-type': 'application/octet-stream', 'content-length': String(13 * 1024 * 1024) }, Buffer.alloc(0))
      return
    }
    if (url.pathname === '/v18.0/MEDIA-1') {
      const host = request.headers.host
      send(response, 200, { 'content-type': 'application/json' }, Buffer.from(JSON.stringify({
        url: `http://${host}/file.png`,
        mime_type: 'image/png',
        file_size: PNG.length,
      })))
      return
    }
    if (url.pathname === '/v18.0/MEDIA-404') {
      send(response, 404, { 'content-type': 'application/json' }, Buffer.from('{"error":"gone"}'))
      return
    }
    send(response, 404, { 'content-type': 'text/plain' }, Buffer.from('not found'))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/**
 * Build a store with one webhook channel and one WhatsApp channel.
 * @param {string} directory - temp profile directory.
 * @returns {Promise<{store: Store, runtime: Record<string, any>, webhookId: string}>} fixtures.
 */
async function profile(directory) {
  const store = new Store(path.join(directory, 'state.json'))
  await store.load()
  configureAttachments(path.join(directory, 'state.json'))
  const runtime = { store, serial: createSerial() }
  const webhook = await executeCommand(runtime, 'channel.create', {
    name: 'Bridge',
    type: 'webhook',
    config: { outboundUrl: '', inboundOnly: true },
  })
  return { store, runtime, webhookId: webhook.result.channelId }
}

/** Wait until the asynchronous persistence has patched the message. */
async function settle(store, predicate, timeoutMs = 5000) {
  const started = Date.now()
  for (;;) {
    const message = store.state.conversations.flatMap((conversation) => conversation.messages).at(-1)
    if (message !== undefined && predicate(message)) return message
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for media persistence')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

test('a bridge attachment URL is stored once and served from the attachment route', async (t) => {
  const server = await provider()
  t.after(() => server.close())
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-media-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const { store, runtime, webhookId } = await profile(directory)

  await handleInbound(runtime, webhookId, {
    externalConversationId: 'c-1',
    externalMessageId: 'm-1',
    contact: { id: 'u-1', name: 'Ada' },
    message: { text: '', attachments: [{ url: `${server.base}/file.png`, name: 'pic.png', type: 'image/png' }] },
  })

  const message = await settle(store, (item) => Array.isArray(item.attachments) && item.attachments[0]?.id !== undefined)
  const attachment = message.attachments[0]
  assert.match(attachment.id, /^att_[0-9a-f]{16}$/)
  assert.equal(attachment.url, `/api/im-omni.attachment?id=${attachment.id}`)
  assert.equal(attachment.type, 'image/png')
  assert.equal(attachment.size, PNG.length)
  const stored = await stat(path.join(directory, 'attachments', `${attachment.id}.bin`))
  assert.equal(stored.size, PNG.length)
  // The provider URL never survives into the document the browser reads.
  assert.equal(JSON.stringify(message).includes(server.base), false)
})

test('an oversized provider body is refused and the message keeps its provider fields', async (t) => {
  const server = await provider()
  t.after(() => server.close())
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-media-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const { store, runtime, webhookId } = await profile(directory)

  await handleInbound(runtime, webhookId, {
    externalConversationId: 'c-2',
    externalMessageId: 'm-2',
    contact: { id: 'u-2', name: 'Bo' },
    message: { text: '', attachments: [{ url: `${server.base}/huge.bin`, name: 'huge.bin', type: 'application/octet-stream' }] },
  })

  const message = await settle(store, (item) => typeof item.attachments?.[0]?.error === 'string')
  assert.match(message.attachments[0].error, /too large/u)
  assert.equal(message.attachments[0].url, `${server.base}/huge.bin`)
})

test('a WhatsApp Cloud media handle resolves through the Graph lookup', async (t) => {
  const server = await provider()
  t.after(() => server.close())
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-media-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const { store, runtime, webhookId } = await profile(directory)
  const whatsapp = await executeCommand(runtime, 'channel.create', {
    name: 'WA',
    type: 'whatsapp_cloud',
    config: {
      phoneNumberId: '1000',
      accessToken: 'token-secret',
      appSecret: 'appsecret',
      verifyToken: 'verify',
    },
  })
  assert.equal(whatsapp.result.channel.type, 'whatsapp_cloud')
  const channel = store.state.channels.find((item) => item.id === whatsapp.result.channelId)

  const message = {
    id: 'msg_wa',
    attachments: [{ name: 'wa.png', type: 'image/png', size: 0, providerId: 'MEDIA-1' }],
  }
  store.state.conversations.push({
    id: 'cnv_wa', channelId: channel.id, contactId: 'ct_wa',
    messages: [message], status: 'open', unread: 0,
  })
  const outcome = await persistInboundMedia({ ...runtime, store }, 'msg_wa', {
    graphBase: server.base,
    graphHosts: ['127.0.0.1'],
    allowHosts: ['127.0.0.1'],
  })
  assert.equal(outcome.persisted, 1)
  const attachment = message.attachments[0]
  assert.match(attachment.id, /^att_/u)
  assert.equal(attachment.type, 'image/png')
  assert.equal(JSON.stringify(attachment).includes('token-secret'), false)
  assert.equal(channel.type, 'whatsapp_cloud')
})

test('a dead media handle is reported instead of throwing into the webhook', async (t) => {
  const server = await provider()
  t.after(() => server.close())
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-media-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const { store, runtime } = await profile(directory)
  await executeCommand(runtime, 'channel.create', {
    name: 'WA2',
    type: 'whatsapp_cloud',
    config: { phoneNumberId: '1000', accessToken: 't', appSecret: 'a', verifyToken: 'v' },
  })
  const message = { id: 'msg_dead', attachments: [{ providerId: 'MEDIA-404', name: 'x', type: 'image/png' }] }
  store.state.conversations.push({
    id: 'cnv_dead', channelId: store.state.channels.find((item) => item.type === 'whatsapp_cloud').id,
    contactId: 'ct_dead', messages: [message], status: 'open', unread: 0,
  })
  const outcome = await persistInboundMedia({ ...runtime, store }, 'msg_dead', {
    graphBase: server.base,
    graphHosts: ['127.0.0.1'],
    allowHosts: ['127.0.0.1'],
  })
  assert.equal(outcome.persisted, 0)
  assert.equal(outcome.failed, 1)
  assert.match(message.attachments[0].error, /HTTP 404/u)
})

test('pendingOf ignores attachments that are already local', () => {
  const message = {
    attachments: [
      { id: 'att_0123456789abcdef', name: 'old.png', type: 'image/png', size: 10, url: '/api/im-omni.attachment?id=att_0123456789abcdef' },
      { name: 'remote', url: 'https://example.test/a.png' },
      { name: 'handle', providerId: 'MEDIA-9' },
      { name: 'nothing' },
    ],
  }
  assert.deepEqual(pendingOf(message).map((item) => item.name), ['remote', 'handle'])
})
