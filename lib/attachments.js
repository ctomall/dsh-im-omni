/**
 * Attachment storage for outbound and inbound media.
 *
 * Bytes live next to the workspace document under `attachments/`, one file per
 * id plus a sidecar with the display metadata. The plugin only ever exposes
 * `{ id, name, type, size, url }`; the absolute path never enters a snapshot.
 * @module dsh-im-omni/lib/attachments
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Largest single attachment accepted from a client. */
export const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024

/** Most attachments allowed on one message. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5

/** `att_` + 16 hex characters. */
const ID = /^att_[0-9a-f]{16}$/

/** Icon-friendly names only; the display name travels in the sidecar. */
const SAFE_NAME = /[^\w.\- ()+\u4e00-\u9fa5]/g

let base = null

/**
 * Point the module at one profile's attachment directory.
 * @param {string} stateFile - the workspace document path.
 * @returns {string} the attachment directory.
 */
export function configureAttachments(stateFile) {
  base = path.join(path.dirname(stateFile), 'attachments')
  return base
}

/** @returns {string} configured directory; throws when unconfigured. */
function directory() {
  if (base === null) throw new Error('attachment storage is not configured')
  return base
}

/**
 * Normalize a client-supplied MIME type.
 * @param {string} value - raw header or field.
 * @returns {string} storeable type.
 */
function normalizeType(value) {
  const type = String(value ?? '').trim().toLowerCase()
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type)) return 'application/octet-stream'
  return type.slice(0, 120)
}

/**
 * Keep the display name but strip anything that could confuse a path or header.
 * @param {string} value - client-supplied name.
 * @returns {string} safe display name.
 */
function normalizeName(value) {
  const raw = String(value ?? '')
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .trim()
    .replace(SAFE_NAME, '')
  return (raw === '' ? 'attachment' : raw).slice(0, 120)
}

/**
 * Public URL for one attachment.
 * @param {string} id - attachment id.
 * @returns {string} owner-authenticated URL.
 */
export function attachmentUrl(id) {
  return `/api/im-omni.attachment?id=${encodeURIComponent(id)}`
}

/**
 * Persist one uploaded file.
 * @param {Buffer} bytes - file bytes.
 * @param {{name?:string, type?:string}} meta - display metadata.
 * @returns {Promise<{id:string,name:string,type:string,size:number,url:string}>} descriptor.
 */
export async function saveAttachment(bytes, meta = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error('empty attachment')
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('attachment too large')
  const dir = directory()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const id = `att_${randomBytes(8).toString('hex')}`
  const record = {
    id,
    name: normalizeName(meta.name),
    type: normalizeType(meta.type),
    size: bytes.length,
    url: attachmentUrl(id),
  }
  await writeFile(path.join(dir, `${id}.bin`), bytes, { mode: 0o600 })
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
  return record
}

/**
 * Read one attachment's metadata.
 * @param {string} id - attachment id.
 * @returns {Promise<{id:string,name:string,type:string,size:number,url:string}|null>} descriptor.
 */
export async function readAttachmentMeta(id) {
  if (typeof id !== 'string' || !ID.test(id)) return null
  try {
    const raw = await readFile(path.join(directory(), `${id}.json`), 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed?.name !== 'string' || typeof parsed?.type !== 'string') return null
    return {
      id,
      name: parsed.name,
      type: parsed.type,
      size: Number(parsed.size) || 0,
      url: attachmentUrl(id),
    }
  } catch {
    return null
  }
}

/**
 * Read one attachment's bytes plus metadata.
 * @param {string} id - attachment id.
 * @returns {Promise<{record:Record<string,any>,bytes:Buffer}|null>} content, or null.
 */
export async function readAttachment(id) {
  const record = await readAttachmentMeta(id)
  if (record === null) return null
  try {
    const bytes = await readFile(path.join(directory(), `${id}.bin`))
    return { record, bytes }
  } catch {
    return null
  }
}

/**
 * Bytes for an attachment an adapter has to upload to a provider.
 * @param {string} id - attachment id.
 * @returns {Promise<Buffer|null>} bytes, or null when the id is unknown.
 */
export async function attachmentBytes(id) {
  const found = await readAttachment(id)
  return found === null ? null : found.bytes
}

/**
 * Drop one attachment. Failures are ignored: a missing file is already gone.
 * @param {string} id - attachment id.
 * @returns {Promise<void>} completion.
 */
export async function deleteAttachment(id) {
  if (typeof id !== 'string' || !ID.test(id)) return
  const dir = directory()
  await unlink(path.join(dir, `${id}.bin`)).catch(() => {})
  await unlink(path.join(dir, `${id}.json`)).catch(() => {})
}

/**
 * Resolve the descriptors a client asked to attach: an uploaded id, or an
 * already-hosted URL passed through by a bridge.
 * @param {unknown} value - `payload.attachments`.
 * @returns {Promise<Array<Record<string,any>>>} descriptors, at most the limit.
 */
export async function resolveAttachments(value) {
  if (!Array.isArray(value)) return []
  const result = []
  for (const entry of value.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)) {
    if (entry === null || typeof entry !== 'object') continue
    if (typeof entry.id === 'string') {
      const record = await readAttachmentMeta(entry.id)
      if (record !== null) result.push(record)
      continue
    }
    if (typeof entry.url === 'string' && entry.url.startsWith('http')) {
      result.push({
        id: '',
        name: normalizeName(entry.name),
        type: normalizeType(entry.type),
        size: Number(entry.size) || 0,
        url: entry.url.slice(0, 2000),
      })
    }
  }
  return result
}

/**
 * Whether a descriptor's bytes are local to this Host.
 * @param {Record<string,any>} attachment - descriptor.
 * @returns {boolean} true when it has an id that resolves locally.
 */
export function isLocalAttachment(attachment) {
  return typeof attachment?.id === 'string' && ID.test(attachment.id)
}

/**
 * MIME prefix of an attachment, used to pick a provider message type.
 * @param {Record<string,any>} attachment - descriptor.
 * @returns {'image'|'video'|'audio'|'document'} coarse media kind.
 */
export function mediaKind(attachment) {
  const type = String(attachment?.type ?? '')
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'document'
}
