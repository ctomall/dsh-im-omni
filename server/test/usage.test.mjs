/**
 * S2: metering, quota enforcement and the billing endpoints.
 *
 * The tests drive the real endpoints: one send is metered, a retried clientId is
 * not metered twice, and a tenant at its plan limit gets 402 instead of a row.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'
import { seedConversation } from './support/fixture.mjs'

const adminUrl = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base
/** @type {pg.Client} */
let admin

before(async () => {
  admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await admin?.end()
  await closeDb()
})

async function post(path, payload, token) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(payload),
  })
  return { status: response.status, body: await response.json() }
}

async function get(path, token) {
  const response = await fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: await response.json() }
}

async function register(label) {
  const email = `${label}-${Date.now()}${Math.floor(Math.random() * 1000)}@test.local`
  const result = await post('/v1/auth/register', {
    email,
    password: 'correct horse battery',
    name: label,
    tenantName: `${label} 团队`,
  })
  assert.equal(result.status, 201, JSON.stringify(result.body))
  return result.body
}

test('a new tenant starts on the trial plan with zero usage', async () => {
  const session = await register('usage-a')
  const plan = await get('/v1/billing/plan', session.accessToken)
  assert.equal(plan.status, 200)
  assert.equal(plan.body.plan.code, 'trial')
  assert.equal(plan.body.usage.messages, 0)
  assert.equal(plan.body.usage.seats, 1)
  assert.equal(plan.body.limits.monthlyMessages, 2000)
})

test('sending a message meters exactly one unit', async () => {
  const session = await register('usage-b')
  const conversationId = await seedConversation(admin, session.tenants[0].tenant_id)
  const sent = await post('/v1/messages', {
    conversationId,
    text: '你好',
    clientId: `c-${Date.now()}`,
  }, session.accessToken)
  assert.equal(sent.status, 201, JSON.stringify(sent.body))
  const usage = await get('/v1/billing/usage', session.accessToken)
  assert.equal(usage.body.usage.messages, 1)
})

test('a retried clientId is idempotent and not metered twice', async () => {
  const session = await register('usage-c')
  const conversationId = await seedConversation(admin, session.tenants[0].tenant_id)
  const clientId = `retry-${Date.now()}`
  const first = await post('/v1/messages', {
    conversationId,
    text: '重试测试',
    clientId,
  }, session.accessToken)
  assert.equal(first.status, 201)
  const second = await post('/v1/messages', {
    conversationId,
    text: '重试测试',
    clientId,
  }, session.accessToken)
  assert.equal(second.status, 200)
  assert.equal(second.body.idempotent, true)
  assert.equal(second.body.message.id, first.body.message.id)
  const usage = await get('/v1/billing/usage', session.accessToken)
  assert.equal(usage.body.usage.messages, 1)
})

test('a tenant at its monthly limit is refused with 402', async () => {
  const session = await register('usage-d')
  const tenantId = session.tenants[0].tenant_id
  // Fill the trial allowance (2000) straight in the database: metering reads
  // the same table the send path writes.
  await admin.query(
    `INSERT INTO usage_events (tenant_id, type, quantity, occurred_at)
     SELECT $1, 'message', 1, now() FROM generate_series(1, 2000)`,
    [tenantId],
  )
  const conversationId = await seedConversation(admin, tenantId)
  const refused = await post('/v1/messages', {
    conversationId,
    text: '超额',
    clientId: `over-${Date.now()}`,
  }, session.accessToken)
  assert.equal(refused.status, 402, JSON.stringify(refused.body))
  assert.equal(refused.body.error.code, 'quota-exceeded')
  assert.equal(refused.body.error.kind, 'message')

  const usage = await get('/v1/billing/usage', session.accessToken)
  assert.equal(usage.body.usage.messages, 2000)
})
