/**
 * Read plane: contacts, channels, conversation messages, mark-read and PATCH.
 *
 * Fixtures are written straight into Postgres (there is no create endpoint yet)
 * and every assertion goes through the HTTP API, so the test covers the SQL
 * projection and the tenant scoping together.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'

const adminUrl = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base
/** @type {pg.Client} */
let admin
/** @type {{token: string, tenantId: string, conversationId: string}} */
let fixture

before(async () => {
  admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`

  const email = `data-${Date.now()}@test.local`
  const registered = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery', name: 'Data', tenantName: '数据团队' }),
  }).then((response) => response.json())
  const tenantId = registered.tenants[0].tenant_id

  const channel = await admin.query(
    "INSERT INTO channels (tenant_id, type, name) VALUES ($1,'telegram','数据 Telegram') RETURNING id",
    [tenantId],
  )
  const contact = await admin.query(
    "INSERT INTO contacts (tenant_id, name, company) VALUES ($1,'林小满','木语家居') RETURNING id",
    [tenantId],
  )
  const conversation = await admin.query(
    `INSERT INTO conversations (tenant_id, channel_id, contact_id, subject, unread)
     VALUES ($1, $2, $3, '数据面测试', 2) RETURNING id`,
    [tenantId, channel.rows[0].id, contact.rows[0].id],
  )
  await admin.query(
    `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, status, created_at) VALUES
      ($1,$2,'in','text','你好，订单破损','received', now() - interval '2 minutes'),
      ($1,$2,'out','text','收到，我来处理','sent', now() - interval '1 minute')`,
    [tenantId, conversation.rows[0].id],
  )
  fixture = { token: registered.accessToken, tenantId, conversationId: conversation.rows[0].id }
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await admin?.end()
  await closeDb()
})

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${fixture.token}`,
      ...(options.headers ?? {}),
    },
  })
  return { status: response.status, body: await response.json() }
}

test('contacts and channels are listed for the tenant', async () => {
  const contacts = await api('/v1/contacts')
  assert.equal(contacts.status, 200)
  assert.equal(contacts.body.items[0].name, '林小满')

  const channels = await api('/v1/channels')
  assert.equal(channels.status, 200)
  assert.equal(channels.body.items[0].name, '数据 Telegram')
})

test('conversations carry the ids the inbox needs', async () => {
  const list = await api('/v1/conversations')
  assert.equal(list.status, 200)
  const conversation = list.body.items[0]
  assert.ok(conversation.channel_id)
  assert.ok(conversation.contact_id)
  assert.equal(conversation.unread, 2)
})

test('messages come back oldest first', async () => {
  const messages = await api(`/v1/conversations/${fixture.conversationId}/messages`)
  assert.equal(messages.status, 200)
  assert.deepEqual(messages.body.items.map((item) => item.body), ['你好，订单破损', '收到，我来处理'])
})

test('mark read clears the unread counter and PATCH changes status', async () => {
  const read = await api(`/v1/conversations/${fixture.conversationId}/read`, { method: 'POST', body: '{}' })
  assert.equal(read.status, 200)
  assert.equal(read.body.conversation.unread, 0)

  const patched = await api(`/v1/conversations/${fixture.conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'resolved', priority: 'high' }),
  })
  assert.equal(patched.status, 200)
  assert.equal(patched.body.conversation.status, 'resolved')
  assert.equal(patched.body.conversation.priority, 'high')
})

test('another tenant sees none of these rows', async () => {
  const other = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `other-${Date.now()}@test.local`,
      password: 'correct horse battery',
      name: 'Other',
      tenantName: '别人团队',
    }),
  }).then((response) => response.json())
  const response = await fetch(`${base}/v1/conversations`, {
    headers: { authorization: `Bearer ${other.accessToken}` },
  })
  const body = await response.json()
  assert.equal(body.items.length, 0)

  const messages = await fetch(`${base}/v1/conversations/${fixture.conversationId}/messages`, {
    headers: { authorization: `Bearer ${other.accessToken}` },
  }).then((r) => r.json())
  assert.equal(messages.items.length, 0)
})
