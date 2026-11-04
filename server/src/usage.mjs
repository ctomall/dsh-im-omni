/**
 * Plans, metering and quota enforcement.
 *
 * Every metered write calls `assertQuota` first and `recordUsage` after it
 * commits, so an over-limit tenant is refused before anything is stored.
 */
import { db, withTenant } from './db.mjs'

/** Kinds the API meters. */
export const METERED = /** @type {const} */ (['message', 'ai', 'seat', 'channel'])

/** Quota exceeded; mapped to HTTP 402 by the router. */
export class QuotaError extends Error {
  /**
   * @param {string} kind - metered kind.
   * @param {number} limit - plan limit.
   * @param {number} used - current usage.
   */
  constructor(kind, limit, used) {
    super(`配额已用尽：${kind}（${used}/${limit}）`)
    this.name = 'QuotaError'
    this.code = 'quota-exceeded'
    this.kind = kind
    this.limit = limit
    this.used = used
  }
}

/**
 * Plan attached to a tenant.
 * @param {string} tenantId - tenant uuid.
 * @returns {Promise<Record<string, any>>} plan row.
 */
export async function planOf(tenantId) {
  const row = await db().query(
    `SELECT p.* FROM tenants t JOIN plans p ON p.code = t.plan WHERE t.id = $1`,
    [tenantId],
  )
  return row.rows[0]
}

/**
 * Current period usage for a tenant.
 * @param {string} tenantId - tenant uuid.
 * @returns {Promise<{messages: number, ai: number, seats: number, channels: number}>} usage.
 */
export async function usageOf(tenantId) {
  return withTenant(tenantId, async (client) => {
    const result = await client.query('SELECT * FROM tenant_period_usage($1, now()::date)', [tenantId])
    const row = result.rows[0]
    return {
      messages: Number(row.messages),
      ai: Number(row.ai),
      seats: Number(row.seats),
      channels: Number(row.channels),
    }
  })
}

/**
 * Refuse a metered write that would cross the plan limit.
 * @param {string} tenantId - tenant uuid.
 * @param {'message'|'ai'|'seat'|'channel'} kind - metered kind.
 * @param {number} [delta] - units about to be written.
 * @returns {Promise<void>} resolves when there is room.
 */
export async function assertQuota(tenantId, kind, delta = 1) {
  const plan = await planOf(tenantId)
  if (plan === undefined) return
  const usage = await usageOf(tenantId)
  const limit = kind === 'message' ? plan.monthly_messages
    : kind === 'ai' ? plan.monthly_ai
      : kind === 'seat' ? plan.seats
        : plan.channels
  // usage keys are plural, the metered kind is singular.
  const key = kind === 'message' ? 'messages' : kind === 'seat' ? 'seats' : kind === 'channel' ? 'channels' : 'ai'
  const used = usage[key] ?? 0
  if (used + delta > limit) throw new QuotaError(kind, limit, used)
}

/**
 * Record metered usage. Callers run this inside the same tenant transaction as
 * the write it measures so a rollback never leaves a phantom unit.
 * @param {import('pg').PoolClient} client - transaction client.
 * @param {string} tenantId - tenant uuid.
 * @param {'message'|'ai'|'seat'|'channel'} kind - metered kind.
 * @param {number} [quantity] - units.
 * @returns {Promise<void>}
 */
export async function recordUsage(client, tenantId, kind, quantity = 1) {
  await client.query(
    'INSERT INTO usage_events (tenant_id, type, quantity) VALUES ($1, $2, $3)',
    [tenantId, kind, quantity],
  )
}

/**
 * Plan + usage snapshot for the billing endpoint.
 * @param {string} tenantId - tenant uuid.
 * @returns {Promise<Record<string, any>>} plan, usage, limits and period.
 */
export async function billingSnapshot(tenantId) {
  const plan = await planOf(tenantId)
  const usage = await usageOf(tenantId)
  const now = new Date()
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return {
    plan: {
      code: plan?.code ?? 'trial',
      name: plan?.name ?? '试用',
      priceCents: plan?.price_cents ?? 0,
      currency: plan?.currency ?? 'CNY',
    },
    limits: {
      seats: plan?.seats ?? 5,
      channels: plan?.channels ?? 2,
      monthlyMessages: plan?.monthly_messages ?? 2000,
      monthlyAi: plan?.monthly_ai ?? 100,
    },
    usage,
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
  }
}
