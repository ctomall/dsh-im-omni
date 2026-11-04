/**
 * Attachment storage and the outbound capability guard.
 * Run with: node --test test/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentBytes,
  configureAttachments,
  deleteAttachment,
  isLocalAttachment,
  mediaKind,
  readAttachment,
  resolveAttachments,
  saveAttachment,
} from '../lib/attachments.js'
import { sendOutbound } from '../lib/channels/index.js'

/** Configure the module against a temporary workspace document. */
async function workspace() {
  const dir = await mkdtemp(path.join(tmpdir(), 'omni-att-'))
  const stateFile = path.join(dir, 'state.json')
  await writeFile(stateFile, '{}')
  configureAttachments(stateFile)
  return { dir, stateFile }
}

test('an uploaded attachment round-trips with its metadata', async () => {
  const { dir } = await workspace()
  try {
    const bytes = Buffer.from('\u8950\u4e09\u56dbPNGDATA')
    const record = await saveAttachment(bytes, { name: '\u7834\u635f\u7167\u7247.png', type: 'image/png' })
    assert.match(record.id, /^att_[0-9a-f]{16}$/)
    assert.equal(record.name, '\u7834\u635f\u7167\u7247.png')
    assert.equal(record.type, 'image/png')
    assert.equal(record.size, bytes.length)
    assert.equal(record.url, `/api/im-omni.attachment?id=${record.id}`)

    const found = await readAttachment(record.id)
    assert.deepEqual(found?.bytes, bytes)
    assert.equal(found?.record.name, record.name)
    assert.deepEqual(await attachmentBytes(record.id), bytes)
    assert.equal(isLocalAttachment(record), true)
    assert.equal(mediaKind(record), 'image')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a hostile or unknown id never resolves to a file', async () => {
  const { dir } = await workspace()
  try {
    assert.equal(await readAttachment('../../etc/passwd'), null)
    assert.equal(await readAttachment('att_0000000000000000'), null)
    assert.equal(await attachmentBytes('not-an-id'), null)
    await deleteAttachment('../../etc/passwd')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('oversized and empty uploads are refused', async () => {
  const { dir } = await workspace()
  try {
    await assert.rejects(() => saveAttachment(Buffer.alloc(0)), /empty attachment/)
    await assert.rejects(() => saveAttachment(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)), /too large/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resolveAttachments accepts uploaded ids and bridge URLs only', async () => {
  const { dir } = await workspace()
  try {
    const saved = await saveAttachment(Buffer.from('hello'), { name: 'a.txt', type: 'text/plain' })
    const resolved = await resolveAttachments([
      { id: saved.id },
      { url: 'https://example.com/x.png', name: '../evil.png', type: 'image/png', size: 10 },
      { url: 'file:///etc/passwd' },
      { id: 'att_ffffffffffffffff' },
      'nonsense',
    ])
    assert.equal(resolved.length, 2)
    assert.equal(resolved[0].id, saved.id)
    assert.equal(resolved[1].url, 'https://example.com/x.png')
    assert.equal(resolved[1].name, 'evil.png')
    assert.equal(isLocalAttachment(resolved[1]), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('only media-capable channels accept attachments', async () => {
  const message = {
    attachments: [{ id: 'att_0000000000000000', name: 'a.png', type: 'image/png', size: 3, url: '/api/im-omni.attachment?id=x' }],
  }
  const refused = await sendOutbound({}, { type: 'slack', config: {} }, { externalId: 'C1' }, message)
  assert.equal(refused.ok, false)
  assert.match(refused.error, /\u6682\u4e0d\u652f\u6301\u9644\u4ef6/)

  const passthrough = await sendOutbound({}, { type: 'webhook', config: { outboundUrl: '' } }, { externalId: 'x' }, {
    text: 'hi',
    attachments: [],
  })
  assert.equal(typeof passthrough.ok, 'boolean')
})
