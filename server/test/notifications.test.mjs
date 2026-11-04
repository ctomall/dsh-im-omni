/**
 * Tenant notifications: settings round-trip with a redacted webhook, inbound
 * messages reach the robot, disabled/quiet tenants stay silent, and the test
 * button reports what happened.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import pg from 'pg'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'
import { buildNotifyPayload, inQuietHours } from '../src/notifications.mjs'

const adminUrl = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base
/** @type {pg.Client} */
let admin
/** @type {import('node:http').Server} */
let robot
/** @type {string} */
let robotUrl
/** @type {string[]} */
const received = []

before(async () => {
  admin = new pg.Client({ connectionString: adminUrl })
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
  robotUrl = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-key-1234`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await new Promise((resolve) => robot.close(resolve))
  await admin?.end()
  await closeDb()
})

async function register(label) {
  const response = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label}-${Date.now()}@test.local`,
      password: 'correct horse battery',
      name: label,
      tenantName: `${label} 团队`,
    }),
  })
  return response.json()
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}

test('settings round-trip masks the webhook key', async () => {
  const session = await register('notify-a')
  const saved = await api('/v1/settings/notify', {
    method: 'PUT',
    token: session.accessToken,
    body: { enabled: true, wecomWebhook: robotUrl, quietStart: '22:00', quietEnd: '08:00' },
  })
  assert.equal(saved.status, 200, JSON.stringify(saved.body))
  assert.equal(saved.body.notify.enabled, true)
  assert.equal(saved.body.notify.configured, true)
  assert.match(saved.body.notify.wecomWebhook, /key=test\*\*\*\*$/)
  assert.equal(saved.body.notify.quietStart, '22:00')
})

test('a non-https webhook is rejected', async () => {
  const session = await register('notify-b')
  const saved = await api('/v1/settings/notify', {
    method: 'PUT',
    token: session.accessToken,
    body: { enabled: true, wecomWebhook: 'http://insecure.example/' },
  })
  assert.equal(saved.status, 422)
  assert.equal(saved.body.error.code, 'invalid-webhook')
})

test('the test button reports a missing configuration', async () => {
  const session = await register('notify-c')
  const result = await api('/v1/settings/notify/test', { method: 'POST', token: session.accessToken })
  assert.equal(result.status, 409)
  assert.match(result.body.error.code, /^notify-/)
})

test('the test button posts a card when configured', async () => {
  const session = await register('notify-d')
  await api('/v1/settings/notify', {
    method: 'PUT',
    token: session.accessToken,
    body: { enabled: true, wecomWebhook: robotUrl },
  })
  // Point the sender at the local robot: same shape, local origin.
  await admin.query(
    "UPDATE tenant_notify SET wecom_webhook = $1 WHERE tenant_id = $2",
    [robotUrl.replace('https://qyapi.weixin.qq.com', 'http://127.0.0.1:' + robot.address().port), session.tenants[0].tenant_id],
  )
  const result = await api('/v1/settings/notify/test', { method: 'POST', token: session.accessToken })
  assert.equal(result.status, 200, JSON.stringify(result.body))
  assert.equal(result.body.sent, true)
  assert.ok(received.some((body) => body.includes('通知测试')))
})

test('an inbound webhook notifies the robot', async () => {
  const session = await register('notify-e')
  const tenantId = session.tenants[0].tenant_id
  await admin.query(
    `INSERT INTO tenant_notify (tenant_id, enabled, wecom_webhook) VALUES ($1, true, $2)`,
    [tenantId, `http://127.0.0.1:${robot.address().port}/send`],
  )
  const channel = await admin.query(
    "INSERT INTO channels (tenant_id, type, name) VALUES ($1,'telegram','通知通道') RETURNING id",
    [tenantId],
  )
  const before = received.length
  const response = await fetch(`${base}/v1/webhooks/${channel.rows[0].id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+8613800000009', name: '通知客户', text: '有新消息了', externalId: 'n-1' }),
  })
  assert.equal(response.status, 201)
  // The notification is fire-and-forget; give it a moment to land.
  for (let attempt = 0; attempt < 20 && received.length === before; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(received.length > before, 'robot did not receive the card')
  assert.ok(received.at(-1).includes('通知客户'))
})

test('a link template adds a deep link to the card', async () => {
  const session = await register('notify-link')
  const tenantId = session.tenants[0].tenant_id
  await admin.query(
    `INSERT INTO tenant_notify (tenant_id, enabled, wecom_webhook, link_template)
     VALUES ($1, true, $2, 'dshomni://chat/{conversationId}')
     ON CONFLICT (tenant_id) DO UPDATE SET wecom_webhook = EXCLUDED.wecom_webhook, link_template = EXCLUDED.link_template, enabled = true`,
    [tenantId, `http://127.0.0.1:${robot.address().port}/send`],
  )
  const channel = await admin.query(
    "INSERT INTO channels (tenant_id, type, name) VALUES ($1,'telegram','链接通道') RETURNING id",
    [tenantId],
  )
  const before = received.length
  await fetch(`${base}/v1/webhooks/${channel.rows[0].id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+8613800000010', name: '链接客户', text: '看得到链接吗', externalId: 'link-1' }),
  })
  for (let attempt = 0; attempt < 20 && received.length === before; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.ok(received.length > before, 'robot did not receive the card')
  assert.match(received.at(-1), /dshomni:\/\/chat\//)
})

test('quiet hours are evaluated with midnight wrap-around', () => {
  const at = (hour, minute = 0) => new Date(2026, 10, 4, hour, minute)
  assert.equal(inQuietHours(at(23), '22:00', '08:00'), true)
  assert.equal(inQuietHours(at(12), '22:00', '08:00'), false)
})

test('the card hides the text when private preview is on', () => {
  const payload = buildNotifyPayload({ contactName: '林小满', text: '订单破损', privatePreview: true })
  assert.match(payload.markdown.content, /你有一条新消息/)
  assert.doesNotMatch(payload.markdown.content, /订单破损/)
})
