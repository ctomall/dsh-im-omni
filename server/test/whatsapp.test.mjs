/**
 * WhatsApp Cloud adapter: outbound goes to Graph with the right shape, inbound
 * Meta payloads flatten into the generic handler, and failures retry.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import pg from 'pg'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'
import { dispatchOnce, closeDispatch } from '../src/dispatch.mjs'

const adminUrl = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base
/** @type {pg.Client} */
let admin
/** @type {import('node:http').Server} */
let graph
/** @type {string} */
let graphBase
/** @type {Array<{url: string, auth: string, body: string}>} */
const graphCalls = []

before(async () => {
  admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`

  graph = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      graphCalls.push({
        url: request.url ?? '',
        auth: request.headers.authorization ?? '',
        body: Buffer.concat(chunks).toString('utf8'),
      })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"messages":[{"id":"wamid.ok"}]}')
    })
  })
  await new Promise((resolve) => graph.listen(0, '127.0.0.1', resolve))
  graphBase = `http://127.0.0.1:${graph.address().port}/v20.0`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => graph.close(resolve))
  await admin?.end()
  await closeDb()
  await closeDispatch()
})

async function seedWa() {
  const registered = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `wa-${Date.now()}@test.local`,
      password: 'correct horse battery',
      name: 'WA',
      tenantName: 'WA 团队',
    }),
  }).then((response) => response.json())
  const tenantId = registered.tenants[0].tenant_id
  const channel = await admin.query(
    `INSERT INTO channels (tenant_id, type, name, credentials, config)
     VALUES ($1, 'whatsapp_cloud', 'WA Cloud', 'wa-token', $2) RETURNING id`,
    [tenantId, JSON.stringify({ phoneNumberId: '123456', graphBaseUrl: graphBase })],
  )
  const contact = await admin.query(
    "INSERT INTO contacts (tenant_id, name, phone) VALUES ($1,'Aisha','+4915112345678') RETURNING id",
    [tenantId],
  )
  const conversation = await admin.query(
    'INSERT INTO conversations (tenant_id, channel_id, contact_id, subject) VALUES ($1,$2,$3,$4) RETURNING id',
    [tenantId, channel.rows[0].id, contact.rows[0].id, 'WA 会话'],
  )
  return { tenantId, channelId: channel.rows[0].id, conversationId: conversation.rows[0].id, token: registered.accessToken }
}

test('outbound whatsapp messages hit the Graph endpoint with the right shape', async () => {
  const fixture = await seedWa()
  const message = await admin.query(
    `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, status)
     VALUES ($1,$2,'out','text','hello from graph','queued') RETURNING id`,
    [fixture.tenantId, fixture.conversationId],
  )
  await admin.query(
    "UPDATE messages SET next_attempt_at = now() + interval '1 day' WHERE status = 'queued' AND id <> $1",
    [message.rows[0].id],
  )
  await admin.query('UPDATE messages SET next_attempt_at = now() WHERE id = $1', [message.rows[0].id])
  await dispatchOnce({ limit: 50 })

  const call = graphCalls.at(-1)
  assert.match(call.url, /\/123456\/messages$/)
  assert.equal(call.auth, 'Bearer wa-token')
  const body = JSON.parse(call.body)
  assert.equal(body.messaging_product, 'whatsapp')
  assert.equal(body.to, '+4915112345678')
  assert.equal(body.text.body, 'hello from graph')

  const row = await admin.query('SELECT status FROM messages WHERE id = $1', [message.rows[0].id])
  assert.equal(row.rows[0].status, 'sent')
})

test('a Meta webhook payload lands as an inbound message', async () => {
  const fixture = await seedWa()
  const response = await fetch(`${base}/v1/webhooks/${fixture.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'Aisha' }, wa_id: '4915112345678' }],
            messages: [{ from: '4915112345678', id: 'wamid.inbound1', type: 'text', text: { body: 'is my order shipped?' } }],
          },
        }],
      }],
    }),
  })
  assert.equal(response.status, 201)
  const body = await response.json()
  const messages = await fetch(`${base}/v1/conversations/${body.conversationId}/messages`, {
    headers: { authorization: `Bearer ${fixture.token}` },
  }).then((r) => r.json())
  assert.equal(messages.items.at(-1).body, 'is my order shipped?')
  assert.equal(messages.items.at(-1).direction, 'in')
})

test('a non-message WhatsApp payload is rejected', async () => {
  const fixture = await seedWa()
  const response = await fetch(`${base}/v1/webhooks/${fixture.channelId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entry: [{ changes: [{ value: { statuses: [] } }] }] }),
  })
  assert.equal(response.status, 422)
})
