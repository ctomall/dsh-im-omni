/**
 * HTTP application for the multi-tenant backend.
 *
 * S1 surface: register / login / refresh / switch, members and invites
 * (one-time codes), device linking (short code -> token) and a tenant-scoped
 * conversation read that proves RLS end to end.
 */
import { createServer } from 'node:http'
import { db, withTenant } from './db.mjs'
import {
  QuotaError,
  assertQuota,
  billingSnapshot,
  currentPeriod,
  ensureInvoice,
  listInvoices,
  recordUsage,
  setInvoiceStatus,
} from './usage.mjs'
import { inc, render as renderMetrics } from './metrics.mjs'
import { InboundError, handleInbound } from './inbound.mjs'
import { parseWebhook as parseWhatsappWebhook } from './channels/whatsapp.mjs'
import { checkScopedAccess } from './scope.mjs'
import { linkAttachments, publicAttachment, readAttachment, storeAttachment } from './attachments.mjs'
import { sendPermissionAlert } from './notifications.mjs'
import { notifyProposal } from './approvals.mjs'
import {
  notifyInbound as notifyInboundMessage,
  sendTestCard,
  notifySettings,
  publicNotifySettings,
  saveNotifySettings,
} from './notifications.mjs'
import {
  ACCESS_TTL,
  hashPassword,
  randomToken,
  sha256,
  shortCode,
  signAccess,
  verifyAccess,
  verifyPassword,
} from './auth.mjs'

const VERSION = '0.2.0'
const REFRESH_TTL_DAYS = 30
const INVITE_TTL_HOURS = 24 * 7
const DEVICE_CODE_TTL_MINUTES = 5

/** Write one JSON response with an explicit content length. */
function send(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

/** Standard error envelope. */
function fail(response, status, code, message) {
  send(response, status, { error: { code, message } })
}

/** Read and parse a JSON body with a size cap. */
async function body(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Validate an email-ish string. */
function email(value) {
  return typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value.trim() : ''
}

/** Build a url-safe tenant slug. */
function slugOf(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
  return `${base === '' ? 'tenant' : base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, '')}`
}

/** Issue an access/refresh pair inside a tenant. */
async function issueTokens(client, { userId, tenantId, role, deviceId = null }) {
  const accessToken = signAccess({ userId, tenantId, role, deviceId }, ACCESS_TTL)
  const refreshToken = randomToken(32)
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000)
  await client.query(
    `INSERT INTO refresh_tokens (user_id, tenant_id, device_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tenantId, deviceId, sha256(refreshToken), expires],
  )
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL }
}

/** Resolve the caller: a signed access token plus a live device when present. */
async function authenticate(request) {
  const header = request.headers.authorization
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null
  const claims = verifyAccess(header.slice(7))
  if (claims === null || claims.userId === '' || claims.tenantId === '') return null
  if (claims.deviceId !== null) {
    const alive = await withTenant(claims.tenantId, async (client) => {
      const row = await client.query('SELECT revoked_at FROM devices WHERE id = $1', [claims.deviceId])
      return row.rowCount > 0 && row.rows[0].revoked_at === null
    })
    if (!alive) return null
  }
  return claims
}

/** Whether the user belongs to the tenant, and with which role. */
async function roleIn(userId, tenantId) {
  const rows = await db().query('SELECT role FROM user_tenants($1) WHERE tenant_id = $2', [userId, tenantId])
  return rows.rowCount === 0 ? null : rows.rows[0].role
}

/** Create a tenant with its owner membership and a trial subscription. */
async function createTenant(client, { name, ownerId }) {
  const tenant = await client.query(
    'INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id, name, slug, plan, status',
    [name, slugOf(name), 'trial'],
  )
  const row = tenant.rows[0]
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [row.id])
  await client.query(
    "INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')",
    [row.id, ownerId],
  )
  await client.query(
    "INSERT INTO subscriptions (tenant_id, plan, status, seats) VALUES ($1, 'trial', 'trialing', 5)",
    [row.id],
  )
  return row
}

/** Route table: [method, pattern, handler]. */
const routes = []
/** Register a route. */
function route(method, pattern, handler) {
  routes.push({ method, pattern: new RegExp(`^${pattern}$`), handler })
}

/**
 * Run tenant work as the authenticated member, so row policies apply to them.
 * @param {{tenantId: string, userId: string}} claims - token claims.
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn - work.
 * @returns {Promise<any>} fn result.
 */
function asMember(claims, fn) {
  return withTenant(claims.tenantId, fn, claims.userId)
}

/**
 * Map a scope decision to the HTTP answer: 404 when the row does not exist with
 * any scope, 403 when it exists but belongs to another member.
 * @param {import('node:http').ServerResponse} response - response.
 * @param {'ok'|'forbidden'|'missing'} decision - scope decision.
 * @returns {boolean} true when the request may continue.
 */
function allowScoped(response, decision) {
  if (decision === 'ok') return true
  if (decision === 'missing') {
    fail(response, 404, 'not-found', '不存在。')
    return false
  }
  fail(response, 403, 'out-of-scope', '这条数据不在你的权限范围内。')
  return false
}

route('GET', '/admin', async (request, response) => {
  const { readFile } = await import('node:fs/promises')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const here = dirname(fileURLToPath(import.meta.url))
  const html = await readFile(join(here, '..', 'public', 'admin.html'), 'utf8')
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  response.end(html)
})

route('GET', '/healthz', async (_request, response) => {
  // Liveness is cheap; readiness includes the database, because an instance
  // that cannot reach Postgres must be pulled out of the load balancer.
  try {
    const started = Date.now()
    await db().query('SELECT 1')
    send(response, 200, {
      ok: true,
      version: VERSION,
      db: { ok: true, latencyMs: Date.now() - started },
      uptimeSeconds: Math.floor(process.uptime()),
    })
  } catch (error) {
    send(response, 503, {
      ok: false,
      version: VERSION,
      db: { ok: false, error: error instanceof Error ? error.message : String(error) },
    })
  }
})

route('GET', '/metrics', async (_request, response) => {
  const body = renderMetrics()
  response.writeHead(200, {
    'content-type': 'text/plain; version=0.0.4; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
})

route('POST', '/v1/auth/register', async (request, response) => {
  const input = await body(request)
  const mail = email(input.email)
  if (mail === '' || typeof input.password !== 'string' || input.password.length < 8) {
    return fail(response, 422, 'invalid', '邮箱格式不正确，密码至少 8 位。')
  }
  const existing = await db().query('SELECT 1 FROM user_by_email($1)', [mail])
  if (existing.rowCount > 0) return fail(response, 409, 'email-taken', '该邮箱已注册。')
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const user = await client.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [mail, await hashPassword(input.password), String(input.name ?? '').slice(0, 80)],
    )
    const tenant = await createTenant(client, {
      name: String(input.tenantName ?? '').slice(0, 80) || `${user.rows[0].name || mail} 的团队`,
      ownerId: user.rows[0].id,
    })
    const tokens = await issueTokens(client, {
      userId: user.rows[0].id,
      tenantId: tenant.id,
      role: 'owner',
    })
    await client.query('COMMIT')
    send(response, 201, {
      user: user.rows[0],
      tenant,
      tenants: [{ tenant_id: tenant.id, name: tenant.name, role: 'owner', slug: tenant.slug }],
      ...tokens,
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

route('POST', '/v1/auth/login', async (request, response) => {
  const input = await body(request)
  const mail = email(input.email)
  const found = await db().query('SELECT * FROM user_by_email($1)', [mail])
  if (found.rowCount === 0) return fail(response, 401, 'bad-credentials', '邮箱或密码不正确。')
  const user = found.rows[0]
  if (!(await verifyPassword(user.password_hash, String(input.password ?? '')))) {
    return fail(response, 401, 'bad-credentials', '邮箱或密码不正确。')
  }
  const tenants = await db().query('SELECT * FROM user_tenants($1)', [user.id])
  if (tenants.rowCount === 0) return fail(response, 403, 'no-tenant', '该账号还没有加入任何团队。')
  const first = tenants.rows[0]
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [first.tenant_id])
    const tokens = await issueTokens(client, {
      userId: user.id,
      tenantId: first.tenant_id,
      role: first.role,
    })
    await client.query('COMMIT')
    send(response, 200, { user: { id: user.id, email: user.email, name: user.name }, tenants: tenants.rows, ...tokens })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

route('POST', '/v1/auth/refresh', async (request, response) => {
  const input = await body(request)
  const raw = String(input.refreshToken ?? '')
  if (raw === '') return fail(response, 401, 'unauthorized', '缺少 refreshToken。')
  const claimed = await db().query('SELECT * FROM claim_refresh($1)', [sha256(raw)])
  if (claimed.rowCount === 0) return fail(response, 401, 'unauthorized', '登录已失效，请重新登录。')
  const row = claimed.rows[0]
  const tenants = await db().query('SELECT * FROM user_tenants($1)', [row.user_id])
  const membership = tenants.rows.find((item) => item.tenant_id === row.tenant_id)
  if (membership === undefined) return fail(response, 403, 'no-tenant', '该账号已离开此团队。')
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [row.tenant_id])
    const tokens = await issueTokens(client, {
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: membership.role,
      deviceId: row.device_id,
    })
    await client.query('COMMIT')
    send(response, 200, { tenants: tenants.rows, ...tokens })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

route('POST', '/v1/auth/switch', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const input = await body(request)
  const tenantId = String(input.tenantId ?? '')
  const role = await roleIn(claims.userId, tenantId)
  if (role === null) return fail(response, 403, 'forbidden', '你不在该团队中。')
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId])
    const tokens = await issueTokens(client, {
      userId: claims.userId,
      tenantId,
      role,
      deviceId: claims.deviceId,
    })
    await client.query('COMMIT')
    send(response, 200, { ...tokens })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

route('GET', '/v1/me', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const user = await db().query('SELECT id, email, name FROM users WHERE id = $1', [claims.userId])
  const tenants = await db().query('SELECT * FROM user_tenants($1)', [claims.userId])
  send(response, 200, { user: user.rows[0], tenants: tenants.rows, currentTenant: claims.tenantId, role: claims.role })
})

route('POST', '/v1/tenants', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const input = await body(request)
  const name = String(input.name ?? '').trim().slice(0, 80)
  if (name === '') return fail(response, 422, 'invalid', '团队名称不能为空。')
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    const tenant = await createTenant(client, { name, ownerId: claims.userId })
    const tokens = await issueTokens(client, { userId: claims.userId, tenantId: tenant.id, role: 'owner' })
    await client.query('COMMIT')
    send(response, 201, { tenant, ...tokens })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

route('GET', '/v1/tenants/([0-9a-f-]{36})/members', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const role = await roleIn(claims.userId, tenantId)
  if (role === null) return fail(response, 403, 'forbidden', '你不在该团队中。')
  const members = await withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT m.user_id, u.email, u.name, m.role, m.joined_at, m.permissions
         FROM memberships m JOIN users u ON u.id = m.user_id
        ORDER BY m.joined_at`,
    )
    return result.rows
  })
  send(response, 200, { items: members })
})

route('PATCH', '/v1/tenants/([0-9a-f-]{36})/members/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const targetId = params[1]
  const role = await roleIn(claims.userId, tenantId)
  if (role !== 'owner' && role !== 'admin') return fail(response, 403, 'forbidden', '只有管理员可以分配权限。')
  const input = await body(request)
  const grant = {}
  if (input.role !== undefined) {
    if (input.role !== 'admin' && input.role !== 'agent') return fail(response, 422, 'invalid', '角色只能是 admin 或 agent。')
    if (role !== 'owner') return fail(response, 403, 'owner-only', '只有所有者可以改角色。')
    grant.role = input.role
  }
  if (input.dataScope !== undefined) {
    if (input.dataScope !== 'all' && input.dataScope !== 'own') {
      return fail(response, 422, 'invalid', 'dataScope 只能是 all 或 own。')
    }
    grant.dataScope = input.dataScope
  }
  if (input.channelIds !== undefined) {
    if (!Array.isArray(input.channelIds)) return fail(response, 422, 'invalid', 'channelIds 必须是数组。')
    const ids = input.channelIds.filter((item) => typeof item === 'string' && /^[0-9a-f-]{36}$/.test(item))
    if (ids.length !== input.channelIds.length) return fail(response, 422, 'invalid', 'channelIds 里有一项不是渠道 id。')
    // A grant may only name channels that exist in this tenant.
    const known = await withTenant(tenantId, async (client) => {
      const result = await client.query('SELECT id FROM channels WHERE tenant_id = $1 AND id = ANY($2::uuid[])', [tenantId, ids])
      return new Set(result.rows.map((row) => row.id))
    })
    const unknown = ids.filter((id) => !known.has(id))
    if (unknown.length > 0) return fail(response, 422, 'invalid', `这个团队里没有渠道 ${unknown[0]}。`)
    grant.channelIds = ids
  }
  // Privileged changes (whole-tenant visibility, or handing out admin) require
  // the target's email, so a stray click cannot escalate anyone.
  if (grant.dataScope === 'all' || grant.role !== undefined) {
    const target = await db().query('SELECT email FROM users WHERE id = $1', [targetId])
    const email = target.rows[0]?.email
    if (email === undefined) return fail(response, 404, 'not-found', '这个团队里没有该成员。')
    if (String(input.confirmEmail ?? '').trim().toLowerCase() !== String(email).toLowerCase()) {
      return fail(response, 422, 'confirm-required', `把成员设为「整个团队」需要输入对方邮箱 ${email} 确认。`)
    }
  }

  // Two-person rule: an admin may propose a privileged change, but only an owner
  // applies it. The request keeps the exact payload for the approver.
  if (role === 'admin' && (grant.dataScope === 'all' || grant.role !== undefined)) {
    const snapshot = await db().query('SELECT name, email FROM users WHERE id = $1', [targetId])
    const targetName = snapshot.rows[0]?.name || snapshot.rows[0]?.email || targetId
    const payload = { ...grant, targetName }
    const request = await withTenant(tenantId, async (client) => {
      const row = await client.query(
        `INSERT INTO approval_requests (tenant_id, action, target_user, payload, requested_by)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING id, action, target_user, payload, status, created_at`,
        [tenantId, grant.role === undefined ? 'member.permissions' : 'member.role', targetId, JSON.stringify(payload), claims.userId],
      )
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
         VALUES ($1, $2, 'approval.requested', $3, $4::jsonb)`,
        [tenantId, claims.userId, targetId, JSON.stringify({ grant, requestId: row.rows[0].id })],
      )
      return row.rows[0]
    })
    const actor = await db().query('SELECT name, email FROM users WHERE id = $1', [claims.userId])
    const target = await db().query('SELECT name, email FROM users WHERE id = $1', [targetId])
    void notifyProposal(tenantId, {
      actor: actor.rows[0]?.name || actor.rows[0]?.email || claims.userId,
      target: target.rows[0]?.name || target.rows[0]?.email || targetId,
      what: grant.role === undefined ? '设为整个团队可见' : `角色改为${grant.role === 'admin' ? '管理员' : '客服'}`,
    }).catch((error) => {
      console.warn('approval notice failed:', error instanceof Error ? error.message : String(error))
    })
    return send(response, 202, { approval: request, pending: true })
  }

  const permissionsGrant = { ...grant }
  delete permissionsGrant.role
  const updated = await withTenant(tenantId, async (client) => {
    const before = await client.query('SELECT role, permissions FROM memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, targetId])
    const result = await client.query(
      `UPDATE memberships
          SET permissions = permissions || $3::jsonb,
              role = COALESCE($4, role)
        WHERE tenant_id = $1 AND user_id = $2
        RETURNING role, permissions`,
      [tenantId, targetId, JSON.stringify(permissionsGrant), grant.role ?? null],
    )
    if (result.rowCount === 0) return null
    const action = grant.role === undefined ? 'member.permissions' : 'member.role'
    await client.query(
      `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [tenantId, claims.userId, action, targetId, JSON.stringify({
        grant,
        before: { role: before.rows[0]?.role, permissions: before.rows[0]?.permissions ?? {} },
        after: { role: result.rows[0].role, permissions: result.rows[0].permissions },
      })],
    )
    return result.rows[0]
  })
  if (updated === null) return fail(response, 404, 'not-found', '这个团队里没有该成员。')
  if (grant.dataScope === 'all') {
    const actor = await db().query('SELECT name, email FROM users WHERE id = $1', [claims.userId])
    const target = await db().query('SELECT name, email FROM users WHERE id = $1', [targetId])
    void sendPermissionAlert(tenantId, {
      actor: actor.rows[0]?.name || actor.rows[0]?.email || claims.userId,
      target: target.rows[0]?.name || target.rows[0]?.email || targetId,
      scope: '整个团队',
    }).catch((error) => {
      console.warn('permission alert failed:', error instanceof Error ? error.message : String(error))
    })
  }
  send(response, 200, { member: { userId: targetId, role: updated.role, permissions: updated.permissions } })
})

route('DELETE', '/v1/tenants/([0-9a-f-]{36})/members/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const targetId = params[1]
  const role = await roleIn(claims.userId, tenantId)
  if (role !== 'owner' && role !== 'admin') return fail(response, 403, 'forbidden', '只有所有者和管理员可以提出移除。')
  if (targetId === claims.userId) return fail(response, 409, 'self', '不能移除自己。')
  const targetRole = await roleIn(targetId, tenantId)
  if (targetRole === 'owner') return fail(response, 409, 'owner', '不能移除所有者。')
  if (targetRole === null) return fail(response, 404, 'not-found', '这个团队里没有该成员。')
  // Removal is destructive and permanent: the caller types the member's email.
  const target = await db().query('SELECT email FROM users WHERE id = $1', [targetId])
  const email = target.rows[0]?.email
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (String(url.searchParams.get('confirmEmail') ?? '').trim().toLowerCase() !== String(email).toLowerCase()) {
    return fail(response, 422, 'confirm-required', `移除成员需要输入对方邮箱 ${email} 确认。`)
  }
  if (role === 'admin') {
    const request = await withTenant(tenantId, async (client) => {
      const row = await client.query(
        `INSERT INTO approval_requests (tenant_id, action, target_user, payload, requested_by)
         VALUES ($1, 'member.remove', $2, $3::jsonb, $4)
         RETURNING id, action, target_user, status, created_at`,
        [tenantId, targetId, JSON.stringify({ role: targetRole, targetName: email }), claims.userId],
      )
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
         VALUES ($1, $2, 'approval.requested', $3, $4::jsonb)`,
        [tenantId, claims.userId, targetId, JSON.stringify({ action: 'member.remove', requestId: row.rows[0].id })],
      )
      return row.rows[0]
    })
    return send(response, 202, { approval: request, pending: true })
  }

  await withTenant(tenantId, async (client) => {
    await client.query('DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, targetId])
    await client.query(
      `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
       VALUES ($1, $2, 'member.remove', $3, $4::jsonb)`,
      [tenantId, claims.userId, targetId, JSON.stringify({ role: targetRole })],
    )
  })
  send(response, 200, { removed: targetId })
})

route('GET', '/v1/tenants/([0-9a-f-]{36})/approvals', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const role = await roleIn(claims.userId, tenantId)
  if (role === null) return fail(response, 403, 'forbidden', '你不在该团队中。')
  const url = new URL(request.url ?? '/', 'http://localhost')
  const status = url.searchParams.get('status') === 'all' ? null : 'pending'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100)
  const before = url.searchParams.get('before')
  const rows = await withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT a.id, a.action, a.target_user, a.payload, a.status, a.created_at, a.decided_at,
              r.name AS requester_name, r.email AS requester_email,
              t.name AS target_name, t.email AS target_email
         FROM approval_requests a
         LEFT JOIN users r ON r.id = a.requested_by
         LEFT JOIN users t ON t.id = a.target_user
        WHERE a.tenant_id = $1 AND ($2::text IS NULL OR a.status = $2)
          AND ($3::timestamptz IS NULL OR a.created_at < $3::timestamptz)
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $4`,
      [tenantId, status, before, limit],
    )
    return result.rows
  })
  send(response, 200, { items: rows })
})

route('POST', '/v1/tenants/([0-9a-f-]{36})/approvals/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const approvalId = params[1]
  const role = await roleIn(claims.userId, tenantId)
  if (role !== 'owner') return fail(response, 403, 'owner-only', '只有所有者可以批准或拒绝。')
  const input = await body(request)
  const decision = input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : ''
  if (decision === '') return fail(response, 422, 'invalid', 'decision 只能是 approve 或 reject。')

  const result = await withTenant(tenantId, async (client) => {
    const request = await client.query(
      'SELECT * FROM approval_requests WHERE tenant_id = $1 AND id = $2 AND status = $3',
      [tenantId, approvalId, 'pending'],
    )
    if (request.rowCount === 0) return { missing: true }
    const row = request.rows[0]
    const payload = row.payload ?? {}
    if (decision === 'approved' && row.action === 'channel.delete') {
      const channelId = row.payload?.channelId
      if (channelId !== undefined) {
        await client.query('DELETE FROM channels WHERE tenant_id = $1 AND id = $2', [tenantId, channelId])
        await client.query(
          `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
           VALUES ($1, $2, 'channel.delete', $3, $4::jsonb)`,
          [tenantId, claims.userId, channelId, JSON.stringify({ requestId: row.id, approvedBy: claims.userId })],
        )
      }
    }
    if (decision === 'approved' && row.action === 'member.remove') {
      await client.query('DELETE FROM memberships WHERE tenant_id = $1 AND user_id = $2', [tenantId, row.target_user])
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
         VALUES ($1, $2, 'member.remove', $3, $4::jsonb)`,
        [tenantId, claims.userId, row.target_user, JSON.stringify({ requestId: row.id, approvedBy: claims.userId })],
      )
    }
    if (decision === 'approved' && row.action !== 'member.remove' && row.action !== 'channel.delete') {
      const permissions = { ...payload }
      delete permissions.role
      if (payload.role !== undefined) {
        await client.query('UPDATE memberships SET role = $3 WHERE tenant_id = $1 AND user_id = $2', [tenantId, row.target_user, payload.role])
      }
      if (Object.keys(permissions).length > 0) {
        await client.query(
          'UPDATE memberships SET permissions = permissions || $3::jsonb WHERE tenant_id = $1 AND user_id = $2',
          [tenantId, row.target_user, JSON.stringify(permissions)],
        )
      }
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [tenantId, claims.userId, row.action, row.target_user, JSON.stringify({ grant: payload, requestId: row.id, approvedBy: claims.userId })],
      )
    }
    const updated = await client.query(
      'UPDATE approval_requests SET status = $3, decided_by = $4, decided_at = now() WHERE tenant_id = $1 AND id = $2 RETURNING status, decided_at',
      [tenantId, approvalId, decision, claims.userId],
    )
    await client.query(
      `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [tenantId, claims.userId, decision === 'approved' ? 'approval.approved' : 'approval.rejected', row.target_user, JSON.stringify({ requestId: row.id })],
    )
    return { status: updated.rows[0].status }
  })
  if (result.missing) return fail(response, 404, 'not-found', '没有待处理的审批。')
  send(response, 200, { status: result.status })
})

route('GET', '/v1/tenants/([0-9a-f-]{36})/audit.csv', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const role = await roleIn(claims.userId, tenantId)
  if (role !== 'owner' && role !== 'admin') return fail(response, 403, 'forbidden', '只有管理员可以导出权限变更记录。')
  const rows = await withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT a.id, a.action, a.created_at, u.email AS actor_email, t.email AS target_email, a.detail
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN users t ON t.id::text = a.target
        WHERE a.tenant_id = $1
          AND a.action IN ('member.permissions', 'member.role', 'member.join', 'member.remove')
        ORDER BY a.id DESC
        LIMIT 5000`,
      [tenantId],
    )
    return result.rows
  })
  const escape = (value) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const lines = ['id,action,created_at,actor_email,target_email,detail']
  for (const row of rows) {
    lines.push([
      row.id,
      row.action,
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      row.actor_email ?? '',
      row.target_email ?? '',
      JSON.stringify(row.detail ?? {}),
    ].map(escape).join(','))
  }
  const body = lines.join('\n') + '\n'
  response.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="permission-audit-${tenantId}.csv"`,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  response.end(body)
})

route('GET', '/v1/tenants/([0-9a-f-]{36})/audit', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const role = await roleIn(claims.userId, tenantId)
  if (role !== 'owner' && role !== 'admin') return fail(response, 403, 'forbidden', '只有管理员可以查看权限变更记录。')
  const url = new URL(request.url ?? '/', 'http://localhost')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20) || 20, 100)
  const before = Number(url.searchParams.get('before') ?? 0) || 0
  const rows = await withTenant(tenantId, async (client) => {
    const result = await client.query(
      `SELECT a.id, a.action, a.target, a.detail, a.created_at,
              u.name AS actor_name, u.email AS actor_email,
              t.name AS target_name, t.email AS target_email
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN users t ON t.id::text = a.target
        WHERE a.tenant_id = $1
          AND a.action IN ('member.permissions', 'member.role', 'member.join', 'member.remove')
          AND ($3 = 0 OR a.id < $3)
        ORDER BY a.id DESC
        LIMIT $2`,
      [tenantId, limit, before],
    )
    return result.rows
  })
  send(response, 200, { items: rows })
})

route('POST', '/v1/tenants/([0-9a-f-]{36})/invites', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = params[0]
  const role = await roleIn(claims.userId, tenantId)
  if (role === null || (role !== 'owner' && role !== 'admin')) {
    return fail(response, 403, 'forbidden', '只有管理员可以邀请成员。')
  }
  const input = await body(request)
  const mail = email(input.email)
  if (mail === '') return fail(response, 422, 'invalid', '邮箱格式不正确。')
  const inviteRole = ['admin', 'agent', 'viewer'].includes(input.role) ? input.role : 'agent'
  const code = shortCode()
  const expires = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000)
  await withTenant(tenantId, async (client) => {
    await client.query(
      `INSERT INTO invite_codes (tenant_id, email, role, code_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, mail, inviteRole, sha256(code), claims.userId, expires],
    )
  })
  send(response, 201, { code, email: mail, role: inviteRole, expiresAt: expires.toISOString() })
})

route('POST', '/v1/invites/accept', async (request, response) => {
  const input = await body(request)
  const code = String(input.code ?? '').trim().toUpperCase()
  const claimed = await db().query('SELECT * FROM claim_invite($1)', [sha256(code)])
  if (claimed.rowCount === 0) return fail(response, 401, 'invite-invalid', '邀请码无效或已过期。')
  const invite = claimed.rows[0]
  await assertQuota(invite.tenant_id, 'seat', 1)
  const existing = await db().query('SELECT * FROM user_by_email($1)', [invite.email])
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    let user = existing.rows[0]
    if (user === undefined) {
      if (typeof input.password !== 'string' || input.password.length < 8) {
        await client.query('ROLLBACK')
        return fail(response, 422, 'password-required', '首次加入需要设置至少 8 位密码。')
      }
      const created = await client.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
        [invite.email, await hashPassword(input.password), String(input.name ?? '').slice(0, 80)],
      )
      user = created.rows[0]
    }
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [invite.tenant_id])
    const joined = await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id) DO NOTHING
       RETURNING role`,
      [invite.tenant_id, user.id, invite.role],
    )
    if (joined.rowCount > 0) {
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
         VALUES ($1, $2, 'member.join', $3, $4::jsonb)`,
        [invite.tenant_id, user.id, user.id, JSON.stringify({ email: invite.email, role: invite.role, source: 'invite' })],
      )
    }
    const tokens = await issueTokens(client, {
      userId: user.id,
      tenantId: invite.tenant_id,
      role: invite.role,
    })
    await client.query('COMMIT')
    const tenants = await db().query('SELECT * FROM user_tenants($1)', [user.id])
    send(response, 200, { user, tenants: tenants.rows, ...tokens })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

route('POST', '/v1/devices/code', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const code = shortCode()
  const expires = new Date(Date.now() + DEVICE_CODE_TTL_MINUTES * 60_000)
  await withTenant(claims.tenantId, async (client) => {
    await client.query(
      'INSERT INTO device_codes (tenant_id, user_id, code_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [claims.tenantId, claims.userId, sha256(code), expires],
    )
  })
  send(response, 201, { code, expiresAt: expires.toISOString() })
})

route('POST', '/v1/devices/link', async (request, response) => {
  const input = await body(request)
  const code = String(input.code ?? '').trim().toUpperCase()
  const claimed = await db().query('SELECT * FROM claim_device_code($1)', [sha256(code)])
  if (claimed.rowCount === 0) return fail(response, 401, 'device-code-invalid', '配对码无效或已过期。')
  const target = claimed.rows[0]
  const deviceToken = randomToken(32)
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [target.tenant_id])
    const device = await client.query(
      `INSERT INTO devices (tenant_id, user_id, name, platform, token_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, platform, created_at`,
      [
        target.tenant_id,
        target.user_id,
        String(input.deviceName ?? '').slice(0, 60) || '手机',
        ['android', 'ios'].includes(input.platform) ? input.platform : 'android',
        sha256(deviceToken),
      ],
    )
    const membership = await db().query('SELECT role FROM user_tenants($1) WHERE tenant_id = $2', [
      target.user_id,
      target.tenant_id,
    ])
    const tokens = await issueTokens(client, {
      userId: target.user_id,
      tenantId: target.tenant_id,
      role: membership.rows[0]?.role ?? 'agent',
      deviceId: device.rows[0].id,
    })
    await client.query('COMMIT')
    send(response, 201, { device: device.rows[0], deviceToken, ...tokens })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

// A phone that just logged in registers itself: the code-based link above is
// for the web-console flow, this one has the user's session already.
route('POST', '/v1/devices/register', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const input = await body(request)
  const rawToken = randomToken(32)
  const client = await db().connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [claims.tenantId])
    const device = await client.query(
      `INSERT INTO devices (tenant_id, user_id, name, platform, token_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, platform, created_at`,
      [
        claims.tenantId,
        claims.userId,
        String(input.deviceName ?? '').slice(0, 60) || '手机',
        ['android', 'ios'].includes(input.platform) ? input.platform : 'android',
        sha256(rawToken),
      ],
    )
    const tokens = await issueTokens(client, {
      userId: claims.userId,
      tenantId: claims.tenantId,
      role: claims.role,
      deviceId: device.rows[0].id,
    })
    await client.query('COMMIT')
    send(response, 201, { device: device.rows[0], deviceToken: rawToken, ...tokens })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
})

route('GET', '/v1/devices', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const devices = await withTenant(claims.tenantId, async (client) => {
    const result = await client.query(
      `SELECT id, user_id, name, platform, last_seen, revoked_at, created_at
         FROM devices WHERE revoked_at IS NULL ORDER BY created_at DESC`,
    )
    return result.rows
  })
  send(response, 200, { items: devices })
})

route('DELETE', '/v1/devices/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const role = await roleIn(claims.userId, claims.tenantId)
  const updated = await withTenant(claims.tenantId, async (client) => {
    const result = await client.query(
      'UPDATE devices SET revoked_at = now() WHERE id = $1 AND (user_id = $2 OR $3 IN (\'owner\',\'admin\')) RETURNING id',
      [params[0], claims.userId, role],
    )
    return result.rowCount
  })
  if (updated === 0) return fail(response, 404, 'not-found', '设备不存在或无权操作。')
  send(response, 200, { ok: true })
})

route('GET', '/v1/billing/plan', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  send(response, 200, await billingSnapshot(claims.tenantId))
})

route('GET', '/v1/billing/usage', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const snapshot = await billingSnapshot(claims.tenantId)
  send(response, 200, { usage: snapshot.usage, limits: snapshot.limits, period: snapshot.period })
})

route('GET', '/v1/billing/invoices', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  send(response, 200, { items: await listInvoices(claims.tenantId) })
})

route('POST', '/v1/billing/invoices', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (claims.role !== 'owner' && claims.role !== 'admin') {
    return fail(response, 403, 'forbidden', '只有管理员可以生成账单。')
  }
  const input = await body(request)
  const period = /^\d{4}-\d{2}-01$/.test(String(input.period ?? '')) ? String(input.period) : currentPeriod()
  const result = await ensureInvoice(claims.tenantId, period)
  send(response, result.created ? 201 : 200, { invoice: result.invoice, created: result.created })
})

route('POST', '/v1/billing/invoices/([0-9a-f-]{36})/status', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (claims.role !== 'owner' && claims.role !== 'admin') {
    return fail(response, 403, 'forbidden', '只有管理员可以改动账单。')
  }
  const input = await body(request)
  const status = ['issued', 'paid', 'void'].includes(input.status) ? input.status : ''
  if (status === '') return fail(response, 422, 'invalid', 'status 只能是 issued/paid/void。')
  const invoice = await setInvoiceStatus(claims.tenantId, params[0], status)
  if (invoice === null) return fail(response, 404, 'not-found', '账单不存在。')
  send(response, 200, { invoice })
})

route('POST', '/v1/attachments', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 12 * 1024 * 1024) return fail(response, 413, 'too-large', '附件不能超过 12 MB。')
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks)
  if (body.length === 0) return fail(response, 422, 'invalid', '附件内容为空。')
  const url = new URL(request.url ?? '/', 'http://localhost')
  const name = url.searchParams.get('name') ?? 'file'
  const type = url.searchParams.get('type') ?? request.headers['content-type'] ?? 'application/octet-stream'
  const row = await storeAttachment(claims.tenantId, { name, type, bytes: body })
  send(response, 201, { attachment: publicAttachment(row) })
})

route('GET', '/v1/attachments/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const file = await readAttachment(claims.tenantId, params[0])
  if (file === null) return fail(response, 404, 'not-found', '附件不存在。')
  // An attachment inherits the visibility of the conversation it was sent in.
  if (file.meta.message_id !== null && file.meta.message_id !== undefined) {
    const conversationId = await withTenant(claims.tenantId, async (client) => {
      const row = await client.query('SELECT conversation_id FROM messages WHERE tenant_id = $1 AND id = $2', [claims.tenantId, file.meta.message_id])
      return row.rows[0]?.conversation_id ?? null
    })
    if (conversationId !== null
      && !allowScoped(response, await checkScopedAccess(claims.tenantId, claims.userId, 'conversations', conversationId))) return
  }
  response.writeHead(200, {
    'content-type': file.meta.type,
    'content-length': file.bytes.length,
    'cache-control': 'private, max-age=300',
  })
  response.end(file.bytes)
})

route('POST', '/v1/messages', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const input = await body(request)
  const conversationId = String(input.conversationId ?? '')
  const clientId = String(input.clientId ?? '')
  const kind = ['text', 'note', 'attachment', 'system'].includes(input.kind) ? input.kind : 'text'
  const text = String(input.text ?? '')
  const attachmentIds = Array.isArray(input.attachments)
    ? input.attachments.map((item) => String(item)).filter((item) => /^[0-9a-f-]{36}$/.test(item))
    : []
  if (conversationId === '' || (text === '' && kind === 'text' && attachmentIds.length === 0)) {
    return fail(response, 422, 'invalid', '缺少会话或消息正文。')
  }

  // Idempotency: a retried send returns the stored message instead of a second one.
  if (clientId !== '') {
    const existing = await withTenant(claims.tenantId, async (client) => {
      const row = await client.query(
        'SELECT message_id FROM client_requests WHERE tenant_id = $1 AND client_id = $2',
        [claims.tenantId, clientId],
      )
      return row.rowCount === 0 ? null : row.rows[0].message_id
    })
    if (existing !== null) {
      const message = await withTenant(claims.tenantId, async (client) => {
        const row = await client.query(
          'SELECT id, conversation_id, direction, kind, body, status, created_at FROM messages WHERE id = $1 LIMIT 1',
          [existing],
        )
        return row.rows[0] ?? null
      })
      return send(response, 200, { message, idempotent: true })
    }
  }

  if (!allowScoped(response, await checkScopedAccess(claims.tenantId, claims.userId, 'conversations', conversationId))) return

  await assertQuota(claims.tenantId, 'message', 1)

  const message = await asMember(claims, async (client) => {
    await client.query('BEGIN')
    try {
      const inserted = await client.query(
        `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, status, client_id)
         VALUES ($1, $2, 'out', $3, $4, 'queued', $5)
         RETURNING id, conversation_id, direction, kind, body, status, created_at`,
        [claims.tenantId, conversationId, kind, text, clientId],
      )
      if (clientId !== '') {
        await client.query(
          'INSERT INTO client_requests (tenant_id, client_id, message_id) VALUES ($1, $2, $3)',
          [claims.tenantId, clientId, inserted.rows[0].id],
        )
      }
      if (attachmentIds.length > 0) {
        await linkAttachments(client, claims.tenantId, inserted.rows[0].id, attachmentIds)
      }
      await recordUsage(client, claims.tenantId, 'message', 1)
      await client.query('COMMIT')
      return inserted.rows[0]
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
  })
  send(response, 201, { message })
})

route('GET', '/v1/settings/workspace', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const row = await asMember(claims, async (client) => {
    const result = await client.query('SELECT * FROM tenant_settings WHERE tenant_id = $1', [claims.tenantId])
    return result.rows[0] ?? null
  })
  send(response, 200, {
    settings: {
      defaultSlaMinutes: row?.default_sla_minutes ?? 30,
      autoAssign: row?.auto_assign ?? true,
      autoTranslate: row?.auto_translate ?? true,
      translationTarget: row?.translation_target ?? 'zh-CN',
      aiSuggestions: row?.ai_suggestions ?? true,
    },
  })
})

route('PATCH', '/v1/settings/workspace', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (claims.role !== 'owner' && claims.role !== 'admin') return fail(response, 403, 'forbidden', '只有管理员可以修改接待默认值。')
  const input = await body(request)
  const sla = input.defaultSlaMinutes === undefined ? null : Number(input.defaultSlaMinutes)
  if (sla !== null && (!Number.isInteger(sla) || sla < 1 || sla > 1440)) return fail(response, 422, 'invalid', '默认 SLA 必须是 1–1440 的整数。')
  const translationTarget = typeof input.translationTarget === 'string' ? input.translationTarget.slice(0, 40) : null
  const row = await withTenant(claims.tenantId, async (client) => {
    const result = await client.query(
      `INSERT INTO tenant_settings (tenant_id, default_sla_minutes, auto_assign, auto_translate, translation_target, ai_suggestions)
       VALUES ($1, COALESCE($2, 30), COALESCE($3, true), COALESCE($4, true), COALESCE($5, 'zh-CN'), COALESCE($6, true))
       ON CONFLICT (tenant_id) DO UPDATE SET
         default_sla_minutes = COALESCE($2, tenant_settings.default_sla_minutes),
         auto_assign = COALESCE($3, tenant_settings.auto_assign),
         auto_translate = COALESCE($4, tenant_settings.auto_translate),
         translation_target = COALESCE($5, tenant_settings.translation_target),
         ai_suggestions = COALESCE($6, tenant_settings.ai_suggestions),
         updated_at = now()
       RETURNING *`,
      [
        claims.tenantId,
        sla,
        typeof input.autoAssign === 'boolean' ? input.autoAssign : null,
        typeof input.autoTranslate === 'boolean' ? input.autoTranslate : null,
        translationTarget,
        typeof input.aiSuggestions === 'boolean' ? input.aiSuggestions : null,
      ],
    )
    return result.rows[0]
  })
  send(response, 200, {
    settings: {
      defaultSlaMinutes: row.default_sla_minutes,
      autoAssign: row.auto_assign,
      autoTranslate: row.auto_translate,
      translationTarget: row.translation_target,
      aiSuggestions: row.ai_suggestions,
    },
  })
})

route('GET', '/v1/settings/notify', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  send(response, 200, { notify: publicNotifySettings(await notifySettings(claims.tenantId)) })
})

route('PUT', '/v1/settings/notify', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (claims.role !== 'owner' && claims.role !== 'admin') {
    return fail(response, 403, 'forbidden', '只有管理员可以修改通知设置。')
  }
  const input = await body(request)
  try {
    const saved = await saveNotifySettings(claims.tenantId, input)
    send(response, 200, { notify: publicNotifySettings(saved) })
  } catch (error) {
    if (error?.code === 'invalid-webhook') return fail(response, 422, error.code, error.message)
    throw error
  }
})

route('POST', '/v1/settings/notify/test', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (claims.role !== 'owner' && claims.role !== 'admin') {
    return fail(response, 403, 'forbidden', '只有管理员可以测试通知。')
  }
  const outcome = await sendTestCard(claims.tenantId)
  if (outcome.skipped) return fail(response, 409, 'notify-' + outcome.skipped, outcome.skipped === 'disabled' ? '通知未开启。' : '还没有配置机器人地址。')
  if (!outcome.ok) return fail(response, 502, 'notify-failed', `企业微信返回 ${outcome.status}`)
  send(response, 200, { sent: true })
})

route('GET', '/v1/contacts', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const items = await asMember(claims, async (client) => {
    const result = await client.query(
      'SELECT id, name, company, phone, email, hue, updated_at FROM contacts ORDER BY name LIMIT 500',
    )
    return result.rows
  })
  send(response, 200, { items })
})

route('GET', '/v1/channels', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const url = new URL(request.url ?? '/', 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  const items = await asMember(claims, async (client) => {
    const result = query === ''
      ? await client.query('SELECT id, name, type, status, health, created_at, owner_user_id FROM channels ORDER BY name')
      : await client.query('SELECT id, name, type, status, health, created_at, owner_user_id FROM channels WHERE name ILIKE $1 ORDER BY name', [`%${query}%`])
    return result.rows
  })
  send(response, 200, { items })
})

route('DELETE', '/v1/channels/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const tenantId = claims.tenantId
  const role = await roleIn(claims.userId, tenantId)
  if (role !== 'owner' && role !== 'admin') return fail(response, 403, 'forbidden', '只有所有者和管理员可以提出删除渠道。')
  if (!allowScoped(response, await checkScopedAccess(tenantId, claims.userId, 'channels', params[0]))) return
  const inUse = await withTenant(tenantId, async (client) => {
    const result = await client.query('SELECT count(*)::int AS n FROM conversations WHERE tenant_id = $1 AND channel_id = $2', [tenantId, params[0]])
    return result.rows[0].n
  })
  if (inUse > 0) return fail(response, 409, 'channel-in-use', '这个渠道下还有会话，先处理或归档。')

  if (role === 'admin') {
    const channelRow = await withTenant(tenantId, async (client) => {
      const result = await client.query('SELECT name FROM channels WHERE tenant_id = $1 AND id = $2', [tenantId, params[0]])
      return result.rows[0] ?? null
    })
    const request = await withTenant(tenantId, async (client) => {
      const row = await client.query(
        `INSERT INTO approval_requests (tenant_id, action, target_user, payload, requested_by)
         VALUES ($1, 'channel.delete', $2, $3::jsonb, $2)
         RETURNING id, action, target_user, status, created_at`,
        [tenantId, claims.userId, JSON.stringify({ channelId: params[0], channelName: channelRow?.name ?? params[0] })],
      )
      await client.query(
        `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
         VALUES ($1, $2, 'approval.requested', $3, $4::jsonb)`,
        [tenantId, claims.userId, params[0], JSON.stringify({ action: 'channel.delete', requestId: row.rows[0].id })],
      )
      return row.rows[0]
    })
    return send(response, 202, { approval: request, pending: true })
  }

  await withTenant(tenantId, async (client) => {
    await client.query('DELETE FROM channels WHERE tenant_id = $1 AND id = $2', [tenantId, params[0]])
    await client.query(
      `INSERT INTO audit_logs (tenant_id, actor_id, action, target, detail)
       VALUES ($1, $2, 'channel.delete', $3, $4::jsonb)`,
      [tenantId, claims.userId, params[0], JSON.stringify({ conversations: 0 })],
    )
  })
  send(response, 200, { deleted: params[0] })
})

route('GET', '/v1/channels/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (!allowScoped(response, await checkScopedAccess(claims.tenantId, claims.userId, 'channels', params[0]))) return
  const row = await asMember(claims, async (client) => {
    const result = await client.query(
      'SELECT id, name, type, status, health, created_at, owner_user_id FROM channels WHERE id = $1',
      [params[0]],
    )
    return result.rows[0] ?? null
  })
  if (row === null) return fail(response, 404, 'not-found', '不存在。')
  send(response, 200, { channel: row })
})

route('GET', '/v1/conversations/([0-9a-f-]{36})/messages', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (!allowScoped(response, await checkScopedAccess(claims.tenantId, claims.userId, 'conversations', params[0]))) return
  const url = new URL(request.url ?? '/', 'http://localhost')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100)
  const before = url.searchParams.get('before')
  const items = await withTenant(claims.tenantId, async (client) => {
    const result = before === null
      ? await client.query(
        `SELECT m.id, m.conversation_id, m.direction, m.kind, m.body, m.status,
                m.client_id, m.created_at,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', a.id, 'name', a.name, 'type', a.type, 'size', a.size))
                  FROM attachments a WHERE a.tenant_id = m.tenant_id AND a.message_id = m.id), '[]'::jsonb) AS attachments
           FROM messages m WHERE m.tenant_id = $1 AND m.conversation_id = $2
          ORDER BY m.created_at DESC, m.id DESC LIMIT $3`,
        [claims.tenantId, params[0], limit],
      )
      : await client.query(
        `SELECT m.id, m.conversation_id, m.direction, m.kind, m.body, m.status,
                m.client_id, m.created_at,
                COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'id', a.id, 'name', a.name, 'type', a.type, 'size', a.size))
                  FROM attachments a WHERE a.tenant_id = m.tenant_id AND a.message_id = m.id), '[]'::jsonb) AS attachments
           FROM messages m WHERE m.tenant_id = $1 AND m.conversation_id = $2 AND m.created_at < $3
          ORDER BY m.created_at DESC, m.id DESC LIMIT $4`,
        [claims.tenantId, params[0], before, limit],
      )
    return result.rows.reverse()
  })
  send(response, 200, { items })
})

route('POST', '/v1/conversations/([0-9a-f-]{36})/read', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (!allowScoped(response, await checkScopedAccess(claims.tenantId, claims.userId, 'conversations', params[0]))) return
  const updated = await withTenant(claims.tenantId, async (client) => {
    const result = await client.query(
      'UPDATE conversations SET unread = 0, updated_at = now() WHERE id = $1 RETURNING id, unread',
      [params[0]],
    )
    return result.rows[0] ?? null
  })
  if (updated === null) return fail(response, 404, 'not-found', '会话不存在。')
  send(response, 200, { conversation: updated })
})

route('PATCH', '/v1/conversations/([0-9a-f-]{36})', async (request, response, params) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  if (!allowScoped(response, await checkScopedAccess(claims.tenantId, claims.userId, 'conversations', params[0]))) return
  const input = await body(request)
  const updated = await withTenant(claims.tenantId, async (client) => {
    const sets = []
    const values = [claims.tenantId, params[0]]
    const push = (column, value) => {
      values.push(value)
      sets.push(`${column} = $${values.length}`)
    }
    if (['open', 'pending', 'resolved', 'snoozed'].includes(input.status)) push('status', input.status)
    if (['low', 'normal', 'high', 'urgent'].includes(input.priority)) push('priority', input.priority)
    if (typeof input.botPaused === 'boolean') push('bot_paused', input.botPaused)
    if (typeof input.muted === 'boolean') push('muted', input.muted)
    if (Array.isArray(input.tags)) push('tags', input.tags.map(String).slice(0, 20))
    if (typeof input.assigneeId === 'string') push('assignee_id', input.assigneeId === '' ? null : input.assigneeId)
    if (sets.length === 0) {
      const current = await client.query(
        'SELECT id, status, priority, unread, tags, bot_paused FROM conversations WHERE tenant_id = $1 AND id = $2',
        [claims.tenantId, params[0]],
      )
      return current.rows[0] ?? null
    }
    sets.push('updated_at = now()')
    const result = await client.query(
      `UPDATE conversations SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $2
       RETURNING id, status, priority, unread, tags, bot_paused, updated_at`,
      values,
    )
    return result.rows[0] ?? null
  })
  if (updated === null) return fail(response, 404, 'not-found', '会话不存在。')
  send(response, 200, { conversation: updated })
})

// Provider callback. Authenticated by the channel credential (HMAC), not by a
// session: WhatsApp/Telegram cannot log in.
route('POST', '/v1/webhooks/([0-9a-f-]{36})', async (request, response, params) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  let payload
  try {
    payload = raw === '' ? {} : JSON.parse(raw)
  } catch {
    return fail(response, 422, 'invalid-json', 'Body must be JSON.')
  }
  try {
    // Meta sends a nested change payload; flatten it before the generic handler.
    const channelRow = await db().query('SELECT * FROM channel_lookup($1)', [params[0]])
    const channelType = channelRow.rows[0]?.type
    let inboundPayload = payload
    // Only a real Meta envelope is flattened; a generic bridge posting the flat
    // shape to a WhatsApp channel keeps working unchanged.
    if (channelType === 'whatsapp_cloud' && Array.isArray(payload?.entry)) {
      const flat = parseWhatsappWebhook(payload)
      if (flat === null) return fail(response, 422, 'invalid', 'Unsupported WhatsApp payload.')
      inboundPayload = flat
    }
    const result = await handleInbound(params[0], inboundPayload, {
      rawBody: raw,
      signature: channelType === 'whatsapp_cloud'
        ? request.headers['x-hub-signature-256']
        : request.headers['x-dsh-signature'],
    })
    if (!result.duplicate && result.conversationId) {
      inc('im_omni_inbound_total', {})
      // Fire-and-forget: a slow robot must never delay the provider ack.
      void (async () => {
        try {
          const channel = await db().query('SELECT * FROM channel_lookup($1)', [params[0]])
          const tenantId = channel.rows[0]?.tenant_id
          if (!tenantId) return
          const details = await withTenant(tenantId, async (client) => {
            const contact = await client.query(
              'SELECT name FROM contacts WHERE tenant_id = $1 AND id = $2',
              [tenantId, result.contactId],
            )
            const channelRow = await client.query(
              'SELECT name FROM channels WHERE tenant_id = $1 AND id = $2',
              [tenantId, params[0]],
            )
            return { contactName: contact.rows[0]?.name, channelName: channelRow.rows[0]?.name }
          })
          await notifyInboundMessage(tenantId, {
            ...details,
            text: String(payload.text ?? ''),
            conversationId: result.conversationId,
          })
        } catch (error) {
          console.warn('notify failed:', error instanceof Error ? error.message : String(error))
        }
      })()
    }
    send(response, result.duplicate ? 200 : 201, result)
  } catch (error) {
    if (error instanceof InboundError) return fail(response, error.status, error.code, error.message)
    throw error
  }
})

route('GET', '/v1/conversations', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const url = new URL(request.url ?? '/', 'http://localhost')
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100)
  const rows = await asMember(claims, async (client) => {
    // Search runs inside the member's row policies, so it can only match rows
    // they may already see; there is no separate scope filter to forget.
    const result = query === ''
      ? await client.query(
        `SELECT v.id, v.channel_id, v.contact_id, v.subject, v.status, v.priority, v.unread, v.tags,
                v.bot_paused, v.muted, v.last_inbound_at, v.updated_at, v.owner_user_id,
                c.name AS contact_name, ch.name AS channel_name
           FROM conversations v
           LEFT JOIN contacts c ON c.id = v.contact_id
           LEFT JOIN channels ch ON ch.id = v.channel_id
          ORDER BY v.updated_at DESC LIMIT $1`,
        [limit],
      )
      : await client.query(
        `SELECT v.id, v.channel_id, v.contact_id, v.subject, v.status, v.priority, v.unread, v.tags,
                v.bot_paused, v.muted, v.last_inbound_at, v.updated_at, v.owner_user_id,
                c.name AS contact_name, ch.name AS channel_name
           FROM conversations v
           LEFT JOIN contacts c ON c.id = v.contact_id
           LEFT JOIN channels ch ON ch.id = v.channel_id
          WHERE v.subject ILIKE $2 OR c.name ILIKE $2 OR ch.name ILIKE $2
             OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = v.id AND m.body ILIKE $2)
          ORDER BY v.updated_at DESC LIMIT $1`,
        [limit, `%${query}%`],
      )
    return result.rows
  })
  send(response, 200, { items: rows, query })
})

/**
 * Collapse a route pattern into a low-cardinality metric label.
 * @param {RegExp} pattern - route pattern.
 * @returns {string} stable label.
 */
function routeLabel(pattern) {
  return pattern.source
    .replaceAll('\\/', '/')
    .replace(/\^\(\[0-9a-f-\]\{36\}\)/g, ':id')
    .replaceAll('[0-9a-f-]{36}', ':id')
    .replaceAll('^', '')
    .replaceAll('$', '')
}

/** Create the HTTP server (unbound; tests listen on port 0). */
export function createApp() {
  return createServer(async (request, response) => {
    // The plugin page runs on the DSH origin and talks to this API cross-origin,
    // so every response is exportable and preflights are answered here.
    const origin = request.headers.origin
    if (typeof origin === 'string' && origin !== '') {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'origin')
      response.setHeader('access-control-allow-credentials', 'false')
      response.setHeader('access-control-allow-headers', 'authorization, content-type, accept')
      response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
      response.setHeader('access-control-max-age', '600')
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      for (const entry of routes) {
        if (entry.method !== request.method) continue
        const match = entry.pattern.exec(url.pathname)
        if (match === null) continue
        const started = Date.now()
        const path = routeLabel(entry.pattern)
        try {
          await entry.handler(request, response, match.slice(1))
        } finally {
          inc('im_omni_requests_total', {
            method: request.method ?? 'GET',
            route: path,
            status: String(response.statusCode),
          })
          inc('im_omni_request_duration_ms_sum', { route: path }, Date.now() - started)
          inc('im_omni_request_duration_ms_count', { route: path })
        }
        return
      }
      fail(response, 404, 'not-found', '未知接口。')
    } catch (error) {
      if (error instanceof QuotaError) {
        inc('im_omni_quota_refusals_total', { kind: error.kind })
        send(response, 402, {
          error: {
            code: error.code,
            message: error.message,
            kind: error.kind,
            limit: error.limit,
            used: error.used,
          },
        })
        return
      }
      fail(response, 500, 'server-error', error instanceof Error ? error.message : String(error))
    }
  })
}
