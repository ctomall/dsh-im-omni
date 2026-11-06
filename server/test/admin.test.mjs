/**
 * The team permission page: served as HTML by the API process, so an operator
 * can hand out channel numbers without another deployment.
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
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await closeDb()
})

test('the permission page is served as HTML', async () => {
  const response = await fetch(`${base}/admin`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  const html = await response.text()
  assert.match(html, /团队权限/)
  assert.match(html, /\/v1\/tenants\//)
  assert.match(html, /dataScope/)
})

test('cross-origin preflight from the plugin page is answered', async () => {
  const response = await fetch(`${base}/v1/channels`, {
    method: 'OPTIONS',
    headers: { origin: 'https://dsh.ila3.top', 'access-control-request-method': 'GET' },
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://dsh.ila3.top')
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /GET/)
})

test('a normal response carries the origin back', async () => {
  const response = await fetch(`${base}/healthz`, { headers: { origin: 'https://dsh.ila3.top' } })
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://dsh.ila3.top')
  assert.equal(response.headers.get('vary'), 'origin')
})

test('workspace defaults are readable by any member and writable by admins', async () => {
  const register = async (label) => fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label}-${Date.now()}@test.local`,
      password: 'correct horse battery',
      name: label,
      tenantName: `${label} 团队`,
    }),
  }).then((response) => response.json())

  const owner = await register('ws-owner')
  const read = await fetch(`${base}/v1/settings/workspace`, { headers: { authorization: `Bearer ${owner.accessToken}` } }).then((response) => response.json())
  assert.equal(read.settings.defaultSlaMinutes, 30)
  assert.equal(read.settings.autoAssign, true)

  const patched = await fetch(`${base}/v1/settings/workspace`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.accessToken}` },
    body: JSON.stringify({ defaultSlaMinutes: 45, autoAssign: false, translationTarget: 'en-US' }),
  }).then((response) => response.json())
  assert.equal(patched.settings.defaultSlaMinutes, 45)
  assert.equal(patched.settings.autoAssign, false)
  assert.equal(patched.settings.translationTarget, 'en-US')

  const again = await fetch(`${base}/v1/settings/workspace`, { headers: { authorization: `Bearer ${owner.accessToken}` } }).then((response) => response.json())
  assert.equal(again.settings.defaultSlaMinutes, 45)

  const invalid = await fetch(`${base}/v1/settings/workspace`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.accessToken}` },
    body: JSON.stringify({ defaultSlaMinutes: 0 }),
  })
  assert.equal(invalid.status, 422)
})
