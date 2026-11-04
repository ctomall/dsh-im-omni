/**
 * S3 acceptance at the smallest useful scale: two stateless instances on the
 * same database. A session created on one is valid on the other, and losing an
 * instance does not interrupt traffic.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'

/** @type {import('node:http').Server[]} */
const servers = []
/** @type {string[]} */
const bases = []

before(async () => {
  for (let index = 0; index < 2; index += 1) {
    const server = createApp()
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    bases.push(`http://127.0.0.1:${server.address().port}`)
  }
})

after(async () => {
  for (const server of servers) {
    if (server.listening) await new Promise((resolve) => server.close(resolve))
  }
  await closeDb()
})

async function post(base, path, payload, token) {
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

async function get(base, path, token) {
  const response = await fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: await response.json() }
}

test('both instances report healthy with a database check', async () => {
  for (const base of bases) {
    const health = await get(base, '/healthz')
    assert.equal(health.status, 200)
    assert.equal(health.body.db.ok, true)
  }
})

test('a session created on one instance works on the other', async () => {
  const email = `ha-${Date.now()}@test.local`
  const registered = await post(bases[0], '/v1/auth/register', {
    email,
    password: 'correct horse battery',
    name: 'HA',
    tenantName: 'HA 团队',
  })
  assert.equal(registered.status, 201, JSON.stringify(registered.body))
  const token = registered.body.accessToken

  const introspected = await get(bases[1], '/v1/me', token)
  assert.equal(introspected.status, 200)
  assert.equal(introspected.body.user.email, email)

  // A write on instance 2 is visible to instance 1: no local state to diverge.
  const sent = await post(bases[1], '/v1/messages', {
    conversationId: '00000000-0000-0000-0000-0000000000dd',
    text: '跨实例',
    clientId: `ha-${Date.now()}`,
  }, token)
  assert.equal(sent.status, 201)
  const usage = await get(bases[0], '/v1/billing/usage', token)
  assert.equal(usage.body.usage.messages, 1)
})

test('killing one instance leaves the other serving', async () => {
  const health = await get(bases[1], '/healthz')
  assert.equal(health.status, 200)

  await new Promise((resolve) => servers[0].close(resolve))
  assert.equal(servers[0].listening, false)

  const survived = await get(bases[1], '/healthz')
  assert.equal(survived.status, 200)
  assert.equal(survived.body.ok, true)

  // The surviving instance keeps serving authenticated traffic too.
  const email = `ha2-${Date.now()}@test.local`
  const registered = await post(bases[1], '/v1/auth/register', {
    email,
    password: 'correct horse battery',
    name: 'HA2',
    tenantName: 'HA2 团队',
  })
  assert.equal(registered.status, 201)
  const me = await get(bases[1], '/v1/me', registered.body.accessToken)
  assert.equal(me.status, 200)
})

test('metrics expose request counts and quota refusals', async () => {
  const response = await fetch(`${bases[1]}/metrics`)
  const text = await response.text()
  assert.equal(response.status, 200)
  assert.match(text, /im_omni_requests_total\{/)
  assert.match(text, /im_omni_uptime_seconds \d+/)
})
