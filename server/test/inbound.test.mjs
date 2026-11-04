/**
 * Inbound webhook: a provider post becomes a message in the right tenant, bumps
 * unread, is idempotent by external id, and rejects a bad signature.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
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
/** @type {{channelId: string, tenantId: string, token: string, secret: string}} */
let fixture

before(async () => {
  admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`

  const registered = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `inbound-${Date.now()}@test.local`,
      password: 'correct horse battery',
      name: 'Inbound',
      tenantName: '入站团队',
    }),
  }).then((response) => response.json())
  const tenantId = registered.tenants[0].tenant_id
  const secret = 'shared-secret'
  const channel = await admin.query(
    `INSERT INTO channels (tenant_id, type, name, credentials)
     VALUES ($1, 'webhook', '入站通道', $2) RETURNING id`,
    [tenantId, secret],
  )
  fixture = { channelId: channel.rows[0].id, tenantId, token: registered.accessToken, secret }
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await admin?.end()
  await closeDb()
})

function signed(body, secret = fixture.secret) {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

async function postWebhook(payload, { signature, raw } = {}) {
  const body = raw ?? JSON.stringify(payload)
  const response = await fetch(`${base}/v1/webhooks/${fixture.channelId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature === undefined ? { 'x-dsh-signature': signed(body) } : signature === null ? {} : { 'x-dsh-signature': signature }),
    },
    body,
  })
  return { status: response.status, body: await response.json() }
}

test('an inbound message lands in the tenant conversation and bumps unread', async () => {
  const result = await postWebhook({ phone: '+8613800000001', name: '林小满', text: '在吗？订单还没到', externalId: 'wa-1' })
  assert.equal(result.status, 201, JSON.stringify(result.body))
  assert.ok(result.body.conversationId)

  const conversations = await fetch(`${base}/v1/conversations`, {
    headers: { authorization: `Bearer ${fixture.token}` },
  }).then((response) => response.json())
  const conversation = conversations.items.find((item) => item.id === result.body.conversationId)
  assert.equal(conversation.unread, 1)

  const messages = await fetch(`${base}/v1/conversations/${result.body.conversationId}/messages`, {
    headers: { authorization: `Bearer ${fixture.token}` },
  }).then((response) => response.json())
  assert.equal(messages.items.at(-1).body, '在吗？订单还没到')
  assert.equal(messages.items.at(-1).direction, 'in')
})

test('the same external id is not stored twice', async () => {
  const first = await postWebhook({ phone: '+8613800000002', name: 'Aisha', text: 'hello', externalId: 'wa-2' })
  assert.equal(first.status, 201)
  const second = await postWebhook({ phone: '+8613800000002', name: 'Aisha', text: 'hello', externalId: 'wa-2' })
  assert.equal(second.status, 200)
  assert.equal(second.body.duplicate, true)
  assert.equal(second.body.messageId, first.body.messageId)
})

test('a bad signature is rejected', async () => {
  const result = await postWebhook({ phone: '+8613800000003', text: 'spoofed', externalId: 'wa-3' }, { signature: 'sha256=deadbeef' })
  assert.equal(result.status, 401)
  assert.equal(result.body.error.code, 'bad-signature')
})

test('an unknown channel is a 404', async () => {
  const response = await fetch(`${base}/v1/webhooks/00000000-0000-0000-0000-0000000000ff`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'x' }),
  })
  assert.equal(response.status, 404)
})
