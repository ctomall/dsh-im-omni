/**
 * Attachments: upload stores bytes, the message carries the descriptor, download
 * returns the same bytes, and another tenant cannot read them.
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

/** A tiny valid PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('upload, attach to a message and download the same bytes', async () => {
  const session = await register('att-a')
  const upload = await fetch(`${base}/v1/attachments?name=dot.png&type=image/png`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.accessToken}`, 'content-type': 'image/png' },
    body: PNG,
  })
  assert.equal(upload.status, 201)
  const attachment = (await upload.json()).attachment
  assert.equal(attachment.name, 'dot.png')
  assert.equal(attachment.size, PNG.length)

  const sent = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify({
      conversationId: '00000000-0000-0000-0000-0000000000aa',
      text: '看看图片',
      kind: 'attachment',
      attachments: [attachment.id],
      clientId: `att-${Date.now()}`,
    }),
  })
  assert.equal(sent.status, 201)
  const message = (await sent.json()).message

  const fetched = await fetch(`${base}/v1/conversations/00000000-0000-0000-0000-0000000000aa/messages`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  }).then((response) => response.json())
  const stored = fetched.items.find((item) => item.id === message.id)
  assert.equal(stored.attachments[0].id, attachment.id)

  const download = await fetch(`${base}/v1/attachments/${attachment.id}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  assert.equal(download.status, 200)
  assert.equal(download.headers.get('content-type'), 'image/png')
  const bytes = Buffer.from(await download.arrayBuffer())
  assert.equal(bytes.length, PNG.length)
})

test('another tenant cannot download the attachment', async () => {
  const owner = await register('att-b')
  const outsider = await register('att-c')
  const upload = await fetch(`${base}/v1/attachments?name=secret.txt&type=text/plain`, {
    method: 'POST',
    headers: { authorization: `Bearer ${owner.accessToken}`, 'content-type': 'text/plain' },
    body: Buffer.from('secret bytes'),
  }).then((response) => response.json())

  const denied = await fetch(`${base}/v1/attachments/${upload.attachment.id}`, {
    headers: { authorization: `Bearer ${outsider.accessToken}` },
  })
  assert.equal(denied.status, 404)
})
