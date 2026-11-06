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
