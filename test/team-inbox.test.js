/**
 * Team inbox adapter: API rows become the snapshot the views render, and writes
 * go to the team endpoints that enforce the member's permission.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTeamInbox, toConversation, toMessage, toSnapshot } from '../lib/team-inbox.mjs'

/** Fake transport recording calls and answering from a table. */
function transport(table = {}) {
  const calls = []
  const call = async (path, init = {}) => {
    calls.push({ path, init })
    const key = `${init.method ?? 'GET'} ${path.split('?')[0]}`
    const reply = table[key] ?? { status: 200, body: { items: [] } }
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body }
  }
  return { call, calls }
}

test('maps a conversation row onto the inbox shape', () => {
  const conversation = toConversation({
    id: 'c1', channel_id: 'ch1', contact_id: 'ct1', subject: '退款进度',
    status: 'open', priority: 'high', unread: 2, tags: ['退款'], updated_at: '2026-11-06T01:00:00Z',
  })
  assert.equal(conversation.id, 'c1')
  assert.equal(conversation.unread, 2)
  assert.deepEqual(conversation.tags, ['退款'])
  assert.deepEqual(conversation.messages, [])
  assert.equal(conversation.team, true)
})

test('maps a message row and defaults missing fields', () => {
  assert.deepEqual(toMessage({ id: 'm1', conversation_id: 'c1', direction: 'outbound', body: 'hi', created_at: '2026-11-06T01:00:00Z' }), {
    id: 'm1', conversationId: 'c1', direction: 'outbound', body: 'hi', at: '2026-11-06T01:00:00Z', status: 'sent', authorType: 'contact', team: true,
  })
  assert.equal(toMessage({ id: 'm2' }).direction, 'inbound')
})

test('builds a snapshot with channels and contacts', () => {
  const snapshot = toSnapshot({
    conversations: [{ id: 'c1' }],
    contacts: [{ id: 'ct1', name: '张三', handle: '+8613800000000' }],
    channels: [{ id: 'ch1', name: '售后 WhatsApp', type: 'whatsapp', status: 'active', health: 'connected' }],
  })
  assert.equal(snapshot.conversations.length, 1)
  assert.equal(snapshot.contacts[0].name, '张三')
  assert.equal(snapshot.channels[0].runtime.health, 'connected')
})

test('load() hydrates the newest messages of the first conversations', async () => {
  const { call, calls } = transport({
    'GET /v1/conversations': { status: 200, body: { items: [{ id: 'c1' }, { id: 'c2' }] } },
    'GET /v1/contacts': { status: 200, body: { items: [] } },
    'GET /v1/channels': { status: 200, body: { items: [] } },
    'GET /v1/conversations/c1/messages': { status: 200, body: { items: [{ id: 'm1', conversation_id: 'c1', direction: 'inbound', body: '你好' }] } },
    'GET /v1/conversations/c2/messages': { status: 200, body: { items: [] } },
  })
  const inbox = createTeamInbox({ call, token: 't' })
  const snapshot = await inbox.load({ limit: 10 })
  assert.equal(snapshot.conversations.length, 2)
  assert.equal(snapshot.conversations[0].messages[0].body, '你好')
  assert.equal(calls[0].init.token, 't')
  assert.match(calls[0].path, /^\/v1\/conversations\?limit=10$/)
})

test('writes go to the team endpoints', async () => {
  const { call, calls } = transport({
    'POST /v1/conversations/c1/read': { status: 200, body: { ok: true } },
    'PATCH /v1/conversations/c1': { status: 200, body: { ok: true } },
    'POST /v1/messages': { status: 201, body: { message: { id: 'm9' } } },
  })
  const inbox = createTeamInbox({ call, token: 't' })
  await inbox.read('c1')
  await inbox.update('c1', { status: 'closed', priority: 'high', ignored: 'x' })
  const sent = await inbox.send('c1', '在的')
  assert.equal(sent.id, 'm9')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].init.body)), { status: 'closed', priority: 'high' })
})

test('a refused write surfaces the API error and code', async () => {
  const { call } = transport({
    'POST /v1/messages': { status: 403, body: { error: { code: 'out-of-scope', message: '没有权限' } } },
  })
  const inbox = createTeamInbox({ call, token: 't' })
  await assert.rejects(() => inbox.send('c1', 'x'), (error) => {
    assert.equal(error.code, 'out-of-scope')
    assert.equal(error.message, '没有权限')
    return true
  })
})

test('channel writes go to the team channel endpoints', async () => {
  const { call, calls } = transport({
    'POST /v1/channels': { status: 201, body: { channel: { id: 'ch9' } } },
    'PATCH /v1/channels/ch1': { status: 200, body: { channel: { id: 'ch1', status: 'paused' } } },
    'DELETE /v1/channels/ch1': { status: 200, body: { deleted: 'ch1' } },
  })
  const inbox = createTeamInbox({ call, token: 't' })
  await inbox.createChannel({ name: '新桥', type: 'webhook' })
  await inbox.updateChannel('ch1', { status: 'paused', ignored: true })
  await inbox.deleteChannel('ch1')
  assert.equal(calls[0].path, '/v1/channels')
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].init.body)), { status: 'paused' })
  assert.equal(calls[2].init.method, 'DELETE')
})
