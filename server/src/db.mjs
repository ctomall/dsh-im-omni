/**
 * Connection pool plus tenant-scoped transactions.
 *
 * Every tenant table is protected by RLS; a transaction without a tenant sees
 * nothing. `withTenant` is the only sanctioned way to touch them.
 */
import pg from 'pg'

/** @type {pg.Pool | null} */
let pool = null

/** @returns {pg.Pool} the process-wide pool. */
export function db() {
  if (pool === null) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL
        ?? 'postgresql://im_omni_app:app_dev_pw@127.0.0.1:5432/im_omni_dev',
      max: Number(process.env.PG_POOL_MAX ?? 10),
    })
  }
  return pool
}

/**
 * Run `fn` inside a transaction whose RLS tenant — and acting member — is fixed.
 * A null `userId` marks internal work (webhooks, dispatcher, usage), which keeps
 * tenant-wide visibility; every request path must pass the authenticated user.
 * @template T
 * @param {string} tenantId - tenant uuid.
 * @param {(client: pg.PoolClient) => Promise<T>} fn - work to run.
 * @param {string|null} [userId] - acting member, or null for system work.
 * @returns {Promise<T>} fn result.
 */
export async function withTenant(tenantId, fn, userId = null) {
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId])
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId ?? ''])
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Release the pool (tests, graceful shutdown). */
export async function closeDb() {
  if (pool !== null) {
    await pool.end()
    pool = null
  }
}
