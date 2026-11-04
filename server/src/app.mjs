/**
 * HTTP application for the multi-tenant backend.
 *
 * S1 surface: register / login / refresh / switch, members and invites
 * (one-time codes), device linking (short code -> token) and a tenant-scoped
 * conversation read that proves RLS end to end.
 */
import { createServer } from 'node:http'
import { db, withTenant } from './db.mjs'
import { QuotaError, assertQuota, billingSnapshot, recordUsage } from './usage.mjs'
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

route('GET', '/healthz', async (_request, response) => send(response, 200, { ok: true, version: VERSION }))

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
      `SELECT m.user_id, u.email, u.name, m.role, m.joined_at
         FROM memberships m JOIN users u ON u.id = m.user_id
        ORDER BY m.joined_at`,
    )
    return result.rows
  })
  send(response, 200, { items: members })
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
    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [invite.tenant_id, user.id, invite.role],
    )
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

route('POST', '/v1/messages', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const input = await body(request)
  const conversationId = String(input.conversationId ?? '')
  const clientId = String(input.clientId ?? '')
  const kind = ['text', 'note', 'attachment', 'system'].includes(input.kind) ? input.kind : 'text'
  const text = String(input.text ?? '')
  if (conversationId === '' || (text === '' && kind === 'text')) {
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

  await assertQuota(claims.tenantId, 'message', 1)

  const message = await withTenant(claims.tenantId, async (client) => {
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

route('GET', '/v1/conversations', async (request, response) => {
  const claims = await authenticate(request)
  if (claims === null) return fail(response, 401, 'unauthorized', '请先登录。')
  const rows = await withTenant(claims.tenantId, async (client) => {
    const result = await client.query(
      `SELECT id, subject, status, priority, unread, updated_at
         FROM conversations ORDER BY updated_at DESC LIMIT 50`,
    )
    return result.rows
  })
  send(response, 200, { items: rows })
})

/** Create the HTTP server (unbound; tests listen on port 0). */
export function createApp() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      for (const entry of routes) {
        if (entry.method !== request.method) continue
        const match = entry.pattern.exec(url.pathname)
        if (match === null) continue
        await entry.handler(request, response, match.slice(1))
        return
      }
      fail(response, 404, 'not-found', '未知接口。')
    } catch (error) {
      if (error instanceof QuotaError) {
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
