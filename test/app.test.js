/**
 * Android distribution route tests: manifest publication and APK serving.
 * Run with: node --test test/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { APK_PATH, apkResponse, versionResponse } from '../lib/app.js'

/** Create an artifact directory holding one manifest and one APK. */
async function publish(dir, overrides = {}) {
  const bytes = Buffer.from('PK\u0003\u0004fake-apk-bytes')
  await writeFile(path.join(dir, 'app-release.apk'), bytes)
  const manifest = {
    versionCode: 7,
    versionName: '0.7.0',
    file: 'app-release.apk',
    notes: 'Inbox polish',
    publishedAt: '2026-11-04T07:00:00.000Z',
    minSdk: 26,
    ...overrides,
  }
  await writeFile(path.join(dir, 'latest.json'), JSON.stringify(manifest))
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') }
}

test('version route reports app-not-published before the first build', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'omni-app-empty-'))
  try {
    const response = await versionResponse({ dist: dir })
    assert.equal(response.status, 404)
    const body = await response.json()
    assert.equal(body.ok, false)
    assert.equal(body.error.code, 'app-not-published')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('version route publishes the manifest with a verified digest', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'omni-app-'))
  try {
    const { sha256 } = await publish(dir)
    const response = await versionResponse({ dist: dir })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.ok, true)
    assert.equal(body.app.versionCode, 7)
    assert.equal(body.app.versionName, '0.7.0')
    assert.equal(body.app.notes, 'Inbox polish')
    assert.equal(body.app.sha256, sha256)
    assert.equal(body.app.size, Buffer.byteLength('PK\u0003\u0004fake-apk-bytes'))
    assert.equal(body.app.apkPath, APK_PATH)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('apk route streams bytes and answers HEAD without a body', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'omni-app-'))
  try {
    const { bytes } = await publish(dir, { versionName: '0.7.1' })
    const get = await apkResponse(new Request('https://host/api/im-omni.app.apk'), { dist: dir })
    assert.equal(get.status, 200)
    assert.equal(get.headers.get('content-type'), 'application/vnd.android.package-archive')
    assert.equal(get.headers.get('x-app-version-name'), '0.7.1')
    assert.match(get.headers.get('content-disposition') ?? '', /dsh-im-omni-0\.7\.1\.apk/)
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes)

    const head = await apkResponse(new Request('https://host/api/im-omni.app.apk', { method: 'HEAD' }), { dist: dir })
    assert.equal(head.status, 200)
    assert.equal(head.headers.get('content-length'), String(bytes.length))
    assert.equal(head.body, null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a manifest naming a missing APK is reported instead of served', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'omni-app-'))
  try {
    await writeFile(path.join(dir, 'latest.json'), JSON.stringify({ versionCode: 7, versionName: '0.7.0', file: 'gone.apk' }))
    const version = await versionResponse({ dist: dir })
    assert.equal(version.status, 404)
    assert.equal((await version.json()).error.code, 'apk-missing')
    const apk = await apkResponse(new Request('https://host/api/im-omni.app.apk'), { dist: dir })
    assert.equal(apk.status, 404)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a manifest with a traversal path or bad version is rejected', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'omni-app-'))
  try {
    await writeFile(path.join(dir, 'latest.json'), JSON.stringify({ versionCode: 7, versionName: '0.7.0', file: '../../etc/passwd' }))
    assert.equal((await versionResponse({ dist: dir })).status, 404)
    await writeFile(path.join(dir, 'latest.json'), JSON.stringify({ versionCode: 0, versionName: '', file: 'a.apk' }))
    assert.equal((await versionResponse({ dist: dir })).status, 404)
    await writeFile(path.join(dir, 'latest.json'), '{not json')
    assert.equal((await versionResponse({ dist: dir })).status, 404)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
