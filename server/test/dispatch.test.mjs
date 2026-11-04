/**
 * Delivery worker: a queued message reaches the channel bridge and becomes
 * `sent`; a failing bridge is retried and finally parked as `failed`.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import pg from 'pg'
import { dispatchOnce, closeDispatch } from '../src/dispatch.mjs'

const adminUrl = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'

/** @type {pg.Client} */
let admin
/** @type {import('node:http').Server} */
let bridge
/** @type {string} */
let bridgeUrl
/** @type {string[]} */
const received = []
/** @type {{ok: boolean}} */
const bridgeMode = { ok: true }

before(async () => {
  admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  bridge = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received.push(Buffer.concat(chunks).toString('utf8'))
      response.writeHead(bridgeMode.ok ? 200 : 500)
      response.end('{}')
    })
  })
  await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve))
  bridgeUrl = `http://127.0.0.1:${bridge.address().port}/send`
})

after(async () => {
  await new Promise((resolve) => bridge.close(resolve))
  await admin?.end()
  await closeDispatch()
})

async function seedTenant(label) {
  const tenant = await admin.query(
    'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id',
    [`${label} 团队`, `${label}-${Date.now()}`],
  )
  const tenantId = tenant.rows[0].id
  const channel = await admin.query(
    `INSERT INTO channels (tenant_id, type, name, config)
     VALUES ($1, 'webhook', $2, $3) RETURNING id`,
    [tenantId, `${label} 通道`, JSON.stringify({ outboundUrl: bridgeUrl })],
  )
  const contact = await admin.query(
    'INSERT INTO contacts (tenant_id, name) VALUES ($1, $2) RETURNING id',
    [tenantId, `${label} 客户`],
  )
  const conversation = await admin.query(
    `INSERT INTO conversations (tenant_id, channel_id, contact_id, subject)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [tenantId, channel.rows[0].id, contact.rows[0].id, `${label} 会话`],
  )
  return { tenantId, conversationId: conversation.rows[0].id }
}

async function queueMessage(fixture, body, status = 'queued') {
  const row = await admin.query(
    `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, status)
     VALUES ($1, $2, 'out', 'text', $3, $4) RETURNING id`,
    [fixture.tenantId, fixture.conversationId, body, status],
  )
  return row.rows[0].id
}

test('a queued message is posted to the bridge and marked sent', async () => {
  const fixture = await seedTenant('dispatch-ok')
  const messageId = await queueMessage(fixture, 'hello bridge')

  const counters = await dispatchOnce({ limit: 5 })
  assert.ok(counters.sent >= 1)
  assert.ok(received.some((body) => body.includes('hello bridge')))

  const row = await admin.query('SELECT status, attempts, error FROM messages WHERE id = $1', [messageId])
  assert.equal(row.rows[0].status, 'sent')
  assert.equal(row.rows[0].attempts, 1)
  assert.equal(row.rows[0].error, '')
})

test('a failing bridge is retried and eventually parked as failed', async () => {
  bridgeMode.ok = false
  try {
    const fixture = await seedTenant('dispatch-fail')
    const messageId = await queueMessage(fixture, 'will fail')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Clear the backoff so the loop runs immediately in the test.
      await admin.query('UPDATE messages SET next_attempt_at = now() WHERE id = $1', [messageId])
      await dispatchOnce({ limit: 5 })
    }
    const row = await admin.query('SELECT status, attempts, error FROM messages WHERE id = $1', [messageId])
    assert.equal(row.rows[0].status, 'failed')
    assert.equal(row.rows[0].attempts, 3)
    assert.match(row.rows[0].error, /500/)
  } finally {
    bridgeMode.ok = true
  }
})

test('a channel without a bridge stays queued and is not retried hot', async () => {
  const tenant = await admin.query(
    'INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id',
    ['no bridge', `no-bridge-${Date.now()}`],
  )
  const tenantId = tenant.rows[0].id
  const channel = await admin.query(
    "INSERT INTO channels (tenant_id, type, name, config) VALUES ($1, 'webhook', '无桥', '{}'::jsonb) RETURNING id",
    [tenantId],
  )
  const contact = await admin.query(
    'INSERT INTO contacts (tenant_id, name) VALUES ($1, $2) RETURNING id',
    [tenantId, 'nobody'],
  )
  const conversation = await admin.query(
    'INSERT INTO conversations (tenant_id, channel_id, contact_id, subject) VALUES ($1,$2,$3,$4) RETURNING id',
    [tenantId, channel.rows[0].id, contact.rows[0].id, '无桥会话'],
  )
  const message = await admin.query(
    `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, status)
     VALUES ($1,$2,'out','text','parked','queued') RETURNING id`,
    [tenantId, conversation.rows[0].id],
  )
  const counters = await dispatchOnce({ limit: 5 })
  assert.ok(counters.skipped >= 1)
  const row = await admin.query('SELECT status, next_attempt_at FROM messages WHERE id = $1', [message.rows[0].id])
  assert.equal(row.rows[0].status, 'queued')
  assert.ok(new Date(row.rows[0].next_attempt_at).getTime() > Date.now())
})
