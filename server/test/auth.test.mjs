/**
 * S1 acceptance: accounts, tenant switching, invites and device linking, plus
 * the isolation guarantee at the HTTP layer (not just SQL).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base

before(async () => {
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${address.port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await closeDb()
})

/** POST JSON. */
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

/** GET JSON. */
async function get(path, token) {
  const response = await fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: await response.json() }
}

/** Register a fresh account and return its session. */
async function register(label) {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const result = await post('/v1/auth/register', {
    email: `${label}-${suffix}@test.local`,
    password: 'correct horse battery',
    name: label,
    tenantName: `${label} 团队`,
  })
  assert.equal(result.status, 201, JSON.stringify(result.body))
  return { ...result.body, email: `${label}-${suffix}@test.local`, password: 'correct horse battery' }
}

test('register returns a session, a tenant and a trial subscription', async () => {
  const session = await register('alice')
  assert.ok(session.accessToken)
  assert.ok(session.refreshToken)
  assert.equal(session.tenants.length, 1)
  assert.equal(session.tenants[0].role, 'owner')
})

test('login rejects a wrong password and accepts the right one', async () => {
  const session = await register('bob')
  const bad = await post('/v1/auth/login', { email: session.email, password: 'nope' })
  assert.equal(bad.status, 401)
  const good = await post('/v1/auth/login', { email: session.email, password: session.password })
  assert.equal(good.status, 200)
  assert.ok(good.body.accessToken)
})

test('refresh rotates the token and the old one dies', async () => {
  const session = await register('carol')
  const first = await post('/v1/auth/refresh', { refreshToken: session.refreshToken })
  assert.equal(first.status, 200)
  const replay = await post('/v1/auth/refresh', { refreshToken: session.refreshToken })
  assert.equal(replay.status, 401)
})

test('a tenant member list is visible to its owner and not to an outsider', async () => {
  const owner = await register('dave')
  const outsider = await register('erin')
  const tenantId = owner.tenants[0].tenant_id
  const mine = await get(`/v1/tenants/${tenantId}/members`, owner.accessToken)
  assert.equal(mine.status, 200)
  assert.equal(mine.body.items.length, 1)
  const theirs = await get(`/v1/tenants/${tenantId}/members`, outsider.accessToken)
  assert.equal(theirs.status, 403)
})

test('conversations are tenant scoped over HTTP', async () => {
  const owner = await register('frank')
  const list = await get('/v1/conversations', owner.accessToken)
  assert.equal(list.status, 200)
  assert.ok(Array.isArray(list.body.items))
  const anonymous = await get('/v1/conversations')
  assert.equal(anonymous.status, 401)
})

test('an invite lets a second user join and switch tenants', async () => {
  const owner = await register('grace')
  const tenantId = owner.tenants[0].tenant_id
  const invite = await post(`/v1/tenants/${tenantId}/invites`, {
    email: `invitee-${Date.now()}@test.local`,
    role: 'agent',
  }, owner.accessToken)
  assert.equal(invite.status, 201)
  assert.ok(invite.body.code)

  const accepted = await post('/v1/invites/accept', {
    code: invite.body.code,
    password: 'agent password 1',
    name: 'Invitee',
  })
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body))
  const tenantIds = accepted.body.tenants.map((item) => item.tenant_id)
  assert.ok(tenantIds.includes(tenantId))

  const switched = await post('/v1/auth/switch', { tenantId }, accepted.body.accessToken)
  assert.equal(switched.status, 200)
})

test('device linking issues a token and revocation kills it', async () => {
  const owner = await register('heidi')
  const code = await post('/v1/devices/code', {}, owner.accessToken)
  assert.equal(code.status, 201)

  const linked = await post('/v1/devices/link', { code: code.body.code, deviceName: 'Pixel', platform: 'android' })
  assert.equal(linked.status, 201, JSON.stringify(linked.body))
  const deviceToken = linked.body.accessToken

  const me = await get('/v1/me', deviceToken)
  assert.equal(me.status, 200)

  // A code is single use.
  const again = await post('/v1/devices/link', { code: code.body.code })
  assert.equal(again.status, 401)

  const listed = await get('/v1/devices', deviceToken)
  assert.equal(listed.status, 200)
  assert.ok(listed.body.items.some((item) => item.id === linked.body.device.id))

  const revoked = await fetch(`${base}/v1/devices/${linked.body.device.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${deviceToken}` },
  })
  assert.equal(revoked.status, 200)

  const dead = await get('/v1/me', deviceToken)
  assert.equal(dead.status, 401)
})
