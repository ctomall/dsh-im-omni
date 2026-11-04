/**
 * End-to-end Host command tests with a temporary store and mocked provider API.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store, publicState } from '../lib/store.js'
import { executeCommand, handleInbound } from '../lib/commands.js'
import { createSerial } from '../lib/util.js'

/** Sleep briefly so queued background delivery can run. */
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

test('create, inbound, outbound, and redaction for a Telegram channel', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-command-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store(path.join(directory, 'state.json'))
  await store.load()
  const runtime = { store, serial: createSerial() }
  const created = await executeCommand(runtime, 'channel.create', {
    name: 'Support bot',
    type: 'telegram',
    config: { botToken: '123:secret', mode: 'polling' },
  })
  const channelId = created.result.channelId
  assert.equal(created.result.channel.type, 'telegram')
  assert.equal(created.result.channel.config.botToken, '••••••••')

  const inbound = await handleInbound(runtime, channelId, {
    event: 'message.created',
    externalConversationId: '1001',
    externalMessageId: 'tg-1',
    contact: { id: '1001', name: 'Mia' },
    message: { text: 'Need help' },
    timestamp: new Date().toISOString(),
  })
  assert.equal(inbound.duplicate, false)
  const duplicate = await handleInbound(runtime, channelId, {
    event: 'message.created',
    externalConversationId: '1001',
    externalMessageId: 'tg-1',
    contact: { id: '1001', name: 'Mia' },
    message: { text: 'Need help' },
  })
  assert.equal(duplicate.duplicate, true)

  const calls = []
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) })
    if (String(url).includes('/sendMessage')) {
      return Response.json({ ok: true, result: { message_id: 44 } })
    }
    return Response.json({ ok: true })
  }
  const conversation = store.state.conversations.find((item) => item.channelId === channelId)
  assert.ok(conversation)
  const sent = await executeCommand(runtime, 'message.send', { conversationId: conversation.id, text: 'On it' })
  assert.ok(sent.result.messageId)
  await delay(80)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /bot123:secret\/sendMessage/)
  assert.equal(calls[0].body.chat_id, '1001')
  assert.equal(calls[0].body.text, 'On it')

  const message = store.state.conversations.find((item) => item.id === conversation.id).messages.at(-1)
  assert.equal(message.status, 'sent')
  const snapshot = publicState(store.state)
  assert.doesNotMatch(JSON.stringify(snapshot), /123:secret/)
  assert.equal(snapshot.channels.find((channel) => channel.id === channelId).health, 'connected')
})

test('generic bridge create, outbound signing, and setup fields', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-generic-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store(path.join(directory, 'state.json'))
  await store.load()
  const runtime = { store, serial: createSerial() }
  const calls = []
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) })
    return Response.json({ ok: true })
  }
  const created = await executeCommand(runtime, 'channel.create', {
    name: 'Partner',
    type: 'webhook',
    config: { outboundUrl: 'https://bridge.example.com/out' },
  })
  const channelId = created.result.channelId
  const bridgeToken = created.result.secrets.bridgeToken
  assert.ok(bridgeToken.length > 20)
  assert.equal(created.result.channel.config.bridgeToken, '••••••••')

  const inbound = await handleInbound(runtime, channelId, {
    externalConversationId: 'partner-thread',
    externalMessageId: 'partner-1',
    contact: { id: 'partner-user', name: 'Hana' },
    message: { text: 'Hello' },
  })
  const conversation = store.state.conversations.find((item) => item.id === inbound.conversationId)
  await executeCommand(runtime, 'message.send', { conversationId: conversation.id, text: 'Hi' })
  await delay(80)
  assert.equal(calls.length, 1)
  assert.match(String(calls[0].headers['x-im-omni-signature']), /^sha256=/)
  assert.equal(calls[0].body.message.text, 'Hi')
})

test('invalid config is rejected and paused channels do not deliver', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-invalid-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store(path.join(directory, 'state.json'))
  await store.load()
  const runtime = { store, serial: createSerial() }
  await assert.rejects(() => executeCommand(runtime, 'channel.create', { name: 'Broken', type: 'whatsapp_cloud', config: {} }), /is required/)
  const created = await executeCommand(runtime, 'channel.create', {
    name: 'Paused',
    type: 'webhook',
    config: { outboundUrl: 'https://bridge.example.com/out' },
  })
  await executeCommand(runtime, 'channel.update', { channelId: created.result.channelId, status: 'paused' })
  await assert.rejects(() => handleInbound(runtime, created.result.channelId, {
    externalConversationId: 'x',
    externalMessageId: 'x1',
    contact: { id: 'u' },
    message: { text: 'hello' },
  }), /paused/)
  await executeCommand(runtime, 'channel.update', { channelId: created.result.channelId, status: 'active' })
  const inbound = await handleInbound(runtime, created.result.channelId, {
    externalConversationId: 'x',
    externalMessageId: 'x1',
    contact: { id: 'u' },
    message: { text: 'hello' },
  })
  assert.ok(inbound.conversationId)
})

test('WhatsApp LID identity is upgraded to a real phone number', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-lid-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store(path.join(directory, 'state.json'))
  await store.load()
  const runtime = { store, serial: createSerial() }
  const created = await executeCommand(runtime, 'channel.create', {
    name: 'LID test',
    type: 'webhook',
    config: {},
  })
  const channelId = created.result.channelId
  const first = await handleInbound(runtime, channelId, {
    externalConversationId: '90855939563607@lid',
    externalMessageId: 'lid-1',
    externalUserId: '90855939563607@lid',
    contact: { id: '90855939563607@lid', name: 'Ctomall' },
    message: { text: 'Hi' },
  })
  const contactId = store.state.conversations.find((item) => item.id === first.conversationId).contactId
  await handleInbound(runtime, channelId, {
    externalConversationId: '90855939563607@lid',
    externalMessageId: 'lid-2',
    externalUserId: '8613370968882@s.whatsapp.net',
    alternateUserId: '90855939563607@lid',
    contact: { id: '8613370968882@s.whatsapp.net', name: 'Ctomall', phone: '8613370968882' },
    message: { text: 'Hi again' },
  })
  const contact = store.state.contacts.find((item) => item.id === contactId)
  assert.equal(store.state.contacts.filter((item) => item.name === 'Ctomall').length, 1)
  assert.equal(contact.phone, '8613370968882')
  assert.ok(contact.identities.some((identity) => identity.externalId === '8613370968882@s.whatsapp.net'))
})
