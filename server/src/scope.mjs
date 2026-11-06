/**
 * Per-member visibility helpers.
 *
 * Row-level security hides another member's channels and conversations, and a
 * hidden row looks exactly like a missing one. To answer 403 (exists, out of
 * scope) or 404 (does not exist) the probe runs in the system context — the same
 * tenant transaction with no acting member — and never returns row data.
 * @module im-omni-server/scope
 */
import { withTenant } from './db.mjs'

/** Tables that carry `owner_user_id` and a per-member policy. */
const SCOPED = new Set(['channels', 'conversations'])

/**
 * Probe whether a scoped row exists in the tenant.
 * @param {'channels'|'conversations'} table - scoped table.
 * @param {string} tenantId - tenant uuid.
 * @param {string} id - row uuid.
 * @returns {Promise<{exists: boolean, ownerId: string|null}>} probe result.
 */
export async function probeScopedRow(table, tenantId, id) {
  if (!SCOPED.has(table)) throw new Error(`not a scoped table: ${table}`)
  return withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT owner_user_id FROM ${table} WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    )
    if (result.rowCount === 0) return { exists: false, ownerId: null }
    return { exists: true, ownerId: result.rows[0].owner_user_id ?? null }
  })
}

/**
 * Whether the member may read and write this row: it exists in the tenant and
 * either they own it or their membership role sees the whole tenant.
 * @param {string} tenantId - tenant uuid.
 * @param {string} userId - acting member.
 * @param {'channels'|'conversations'} table - scoped table.
 * @param {string} id - row uuid.
 * @returns {Promise<'ok'|'forbidden'|'missing'>} decision.
 */
export async function checkScopedAccess(tenantId, userId, table, id) {
  const { exists, ownerId } = await probeScopedRow(table, tenantId, id)
  if (!exists) return 'missing'
  if (ownerId !== null && ownerId === userId) return 'ok'
  const role = await withTenant(tenantId, async (client) => {
    const row = await client.query(
      'SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId],
    )
    return row.rows[0]?.role ?? null
  })
  return role === 'owner' || role === 'admin' ? 'ok' : 'forbidden'
}
