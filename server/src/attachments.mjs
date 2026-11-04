/**
 * Attachment storage: metadata in Postgres, bytes on disk.
 *
 * The path is derived from the tenant and a random key, so one tenant can never
 * guess another tenant's file even if it knows the id.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { withTenant } from './db.mjs'

const here = dirname(fileURLToPath(import.meta.url))
/** Root directory for stored bytes. */
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(here, '..', 'uploads')

/**
 * Store one file and its metadata.
 * @param {string} tenantId - tenant uuid.
 * @param {{name: string, type: string, bytes: Buffer}} file - file to store.
 * @returns {Promise<Record<string, any>>} attachment row.
 */
export async function storeAttachment(tenantId, file) {
  const key = `${tenantId}/${randomBytes(12).toString('hex')}`
  const path = join(UPLOAD_DIR, key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, file.bytes)
  return withTenant(tenantId, async (client) => {
    const row = await client.query(
      `INSERT INTO attachments (tenant_id, name, type, size, object_key)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, file.name.slice(0, 200), file.type.slice(0, 120), file.bytes.length, key],
    )
    return row.rows[0]
  })
}

/**
 * Read one attachment's bytes and metadata.
 * @param {string} tenantId - tenant uuid.
 * @param {string} attachmentId - attachment uuid.
 * @returns {Promise<{meta: Record<string, any>, bytes: Buffer} | null>} file or null.
 */
export async function readAttachment(tenantId, attachmentId) {
  const meta = await withTenant(tenantId, async (client) => {
    const row = await client.query('SELECT * FROM attachments WHERE tenant_id = $1 AND id = $2', [tenantId, attachmentId])
    return row.rows[0] ?? null
  })
  if (meta === null) return null
  return { meta, bytes: await readFile(join(UPLOAD_DIR, meta.object_key)) }
}

/**
 * Public shape for a client.
 * @param {Record<string, any>} row - attachment row.
 * @returns {Record<string, any>} client-facing descriptor.
 */
export function publicAttachment(row) {
  return { id: row.id, name: row.name, type: row.type, size: row.size, url: `/v1/attachments/${row.id}` }
}

/**
 * Attach stored files to a message.
 * @param {import('pg').PoolClient} client - tenant transaction.
 * @param {string} tenantId - tenant uuid.
 * @param {string} messageId - message uuid.
 * @param {string[]} ids - attachment ids.
 * @returns {Promise<void>}
 */
export async function linkAttachments(client, tenantId, messageId, ids) {
  if (ids.length === 0) return
  await client.query(
    'UPDATE attachments SET message_id = $3 WHERE tenant_id = $1 AND id = ANY($2::uuid[])',
    [tenantId, ids, messageId],
  )
}
