/**
 * The Host-side proxy that lets the panel reach the team API without CORS,
 * mixed-content or 127.0.0.1 confusion.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { forwardSaas } from '../lib/saas-proxy.mjs'

/** Start a tiny API double; returns its base and captured calls. */
async function api(t, respond = () => ({})) {
  const calls = []
  const server = createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      calls.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') })
      const { status = 200, body = { ok: true } } = respond(request) ?? {}
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return { base: `http://127.0.0.1:${server.address().port}`, calls }
}

test('forwards a GET with the authorization header', async (t) => {
  const { base, calls } = await api(t)
  const result = await forwardSaas({ base, path: '/v1/me', headers: { authorization: 'Bearer abc' } })
  assert.equal(result.status, 200)
  assert.equal(calls[0].url, '/v1/me')
  assert.equal(calls[0].headers.authorization, 'Bearer abc')
})

test('forwards a JSON write', async (t) => {
  const { base, calls } = await api(t)
  await forwardSaas({ base, path: '/v1/auth/login', method: 'POST', body: { email: 'a@b.c' } })
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'a@b.c' })
  assert.match(calls[0].headers['content-type'], /application\/json/)
})

test('passes the upstream error body through unchanged', async (t) => {
  const { base } = await api(t, () => ({ status: 403, body: { error: { code: 'forbidden', message: 'no' } } }))
  const result = await forwardSaas({ base, path: '/v1/tenants/x/members' })
  assert.equal(result.status, 403)
  assert.equal(result.body.error.code, 'forbidden')
})

test('refuses paths and methods outside the API surface', async () => {
  await assert.rejects(() => forwardSaas({ base: 'http://127.0.0.1:1', path: '/etc/passwd' }), /path not allowed/)
  await assert.rejects(() => forwardSaas({ base: 'http://127.0.0.1:1', path: '/v1/me', method: 'TRACE' }), /method not allowed/)
  await assert.rejects(() => forwardSaas({ base: 'file:///tmp', path: '/v1/me' }), /http\(s\) origin/)
})
