/**
 * Two-person rule notifications: a proposal tells the owners immediately, and a
 * pending request older than a day is reminded exactly once.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { createServer } from 'node:http'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'
import { STALE_AFTER_MS, remindStaleApprovals } from '../src/approvals.mjs'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base
/** @type {pg.Client} */
let admin
/** @type {import('node:http').Server} */
let robot
/** @type {string[]} */
const received = []

before(async () => {
  admin = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL
      ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev',
  })
  await admin.connect()
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`

  robot = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      received.push(Buffer.concat(chunks).toString('utf8'))
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"errcode":0}')
    })
  })
  await new Promise((resolve) => robot.listen(0, '127.0.0.1', resolve))
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => robot.close(resolve))
  await admin?.end()
  await closeDb()
})

async function request(method, path, token, payload) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: response.status, body: await response.json() }
}

async function register(label) {
  const response = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.local`,
      password: 'correct horse battery',
      name: label,
      tenantName: `${label} 团队`,
    }),
  })
  return response.json()
}

/** Owner tenant with one admin member and a robot already configured. */
async function fixture() {
  const owner = await register('owner')
  const tenantId = owner.tenants[0].tenant_id
  const adminUser = await register('admin')
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'admin'`,
    [tenantId, adminUser.user.id],
  )
  const switched = await request('POST', '/v1/auth/switch', adminUser.accessToken, { tenantId })
  const target = await register('target')
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'agent')
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'agent'`,
    [tenantId, target.user.id],
  )
  await admin.query(
    `INSERT INTO tenant_notify (tenant_id, enabled, wecom_webhook)
     VALUES ($1, true, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET enabled = true, wecom_webhook = EXCLUDED.wecom_webhook`,
    [tenantId, `http://127.0.0.1:${robot.address().port}/send`],
  )
  return { tenantId, ownerToken: owner.accessToken, adminToken: switched.body.accessToken, targetId: target.user.id, targetEmail: target.user.email }
}

test('a proposal notifies the owners right away', async () => {
  const f = await fixture()
  received.length = 0
  const proposed = await request('PATCH', `/v1/tenants/${f.tenantId}/members/${f.targetId}`, f.adminToken, { dataScope: 'all', confirmEmail: f.targetEmail })
  assert.equal(proposed.status, 202)
  for (let attempt = 0; attempt < 20 && received.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(received.length > 0, 'no proposal card was posted')
  assert.match(received.at(-1), /待审批/)
  assert.match(received.at(-1), /整个团队/)
})

test('a stale approval is reminded once', async () => {
  const f = await fixture()
  const proposed = await request('PATCH', `/v1/tenants/${f.tenantId}/members/${f.targetId}`, f.adminToken, { dataScope: 'all', confirmEmail: f.targetEmail })
  const approvalId = proposed.body.approval.id
  await admin.query('UPDATE approval_requests SET created_at = now() - interval \'2 days\' WHERE id = $1', [approvalId])
  received.length = 0
  const now = new Date(Date.now() + 60_000)
  const first = await remindStaleApprovals({ now })
  assert.ok(first.reminded >= 1)
  assert.ok(received.some((body) => body.includes('超过 24 小时')))

  const before = received.length
  const second = await remindStaleApprovals({ now })
  assert.equal(second.reminded, 0, 'a reminded request must not be reminded twice')
  assert.equal(received.length, before)
})

test('a fresh approval is not reminded', async () => {
  const f = await fixture()
  const proposed = await request('PATCH', `/v1/tenants/${f.tenantId}/members/${f.targetId}`, f.adminToken, { dataScope: 'all', confirmEmail: f.targetEmail })
  received.length = 0
  await remindStaleApprovals({ now: new Date(Date.now() + STALE_AFTER_MS - 60_000) })
  // The sweep is global, so assert this request itself stayed untouched.
  const row = await admin.query('SELECT reminded_at FROM approval_requests WHERE id = $1', [proposed.body.approval.id])
  assert.equal(row.rows[0].reminded_at, null)
  assert.equal(proposed.status, 202)
})
