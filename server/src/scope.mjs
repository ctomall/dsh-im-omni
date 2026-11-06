/**
 * Per-member visibility helpers.
 *
 * Row-level security already hides rows outside the member's permission. A
 * hidden row and a missing row look the same through the scoped transaction, so
 * the handlers probe with the same tenant and no acting member: the probe reads
 * ownership only, and never returns row data.
 *
 * Permission wins over the role default: `dataScope: 'all'` widens to the whole
 * tenant, `channelIds` adds individual channel numbers (their conversations
 * follow), and everything else stays with the owner of the row.
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
 * @returns {Promise<{exists: boolean, ownerId: string|null, channelId: string|null}>} probe result.
 */
export async function probeScopedRow(table, tenantId, id) {
  if (!SCOPED.has(table)) throw new Error(`not a scoped table: ${table}`)
  return withTenant(tenantId, async (client) => {
    const result = table === 'channels'
      ? await client.query('SELECT owner_user_id, id AS channel_id FROM channels WHERE tenant_id = $1 AND id = $2', [tenantId, id])
      : await client.query('SELECT owner_user_id, channel_id FROM conversations WHERE tenant_id = $1 AND id = $2', [tenantId, id])
    if (result.rowCount === 0) return { exists: false, ownerId: null, channelId: null }
    return { exists: true, ownerId: result.rows[0].owner_user_id ?? null, channelId: result.rows[0].channel_id ?? null }
  })
}

/**
 * Read the member's effective permission: the stored grant, else the role default.
 * @param {string} tenantId - tenant uuid.
 * @param {string} userId - acting member.
 * @returns {Promise<{scope: 'all'|'own', channelIds: string[]}>} effective permission.
 */
export async function permissionOf(tenantId, userId) {
  const row = await withTenant(tenantId, async (client) => {
    const result = await client.query(
      'SELECT role, permissions FROM memberships WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId],
    )
    return result.rows[0] ?? null
  })
  if (row === null) return { scope: 'own', channelIds: [] }
  const stored = row.permissions ?? {}
  const scope = stored.dataScope === 'all' || stored.dataScope === 'own'
    ? stored.dataScope
    : row.role === 'owner' || row.role === 'admin' ? 'all' : 'own'
  const channelIds = Array.isArray(stored.channelIds) ? stored.channelIds.filter((item) => typeof item === 'string') : []
  return { scope, channelIds }
}

/**
 * Whether the member may read and write this row.
 * @param {string} tenantId - tenant uuid.
 * @param {string} userId - acting member.
 * @param {'channels'|'conversations'} table - scoped table.
 * @param {string} id - row uuid.
 * @returns {Promise<'ok'|'forbidden'|'missing'>} decision.
 */
export async function checkScopedAccess(tenantId, userId, table, id) {
  const { exists, ownerId, channelId } = await probeScopedRow(table, tenantId, id)
  if (!exists) return 'missing'
  if (ownerId !== null && ownerId === userId) return 'ok'
  const permission = await permissionOf(tenantId, userId)
  if (permission.scope === 'all') return 'ok'
  // A granted channel number carries its conversations with it.
  const granted = table === 'channels' ? id : channelId
  if (granted !== null && granted !== undefined && permission.channelIds.includes(granted)) return 'ok'
  return 'forbidden'
}
