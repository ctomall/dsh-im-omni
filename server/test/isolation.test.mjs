/**
 * Per-member isolation: a teammate sees only the channel numbers and the data
 * assigned to them, every path (list, detail, messages, send, patch, contacts)
 * is scoped on the server, and a role change takes effect on the next request.
 *
 * Fixtures create two agents inside one tenant, each with their own channel and
 * conversation; the owner is the third member and must see everything.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'
import { seedConversation } from './support/fixture.mjs'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base
/** @type {pg.Client} */
let admin

before(async () => {
  admin = new pg.Client({
    connectionString: process.env.ADMIN_DATABASE_URL
      ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev',
  })
  await admin.connect()
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await admin?.end()
  await closeDb()
})

async function request(method, path, token, payload) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: response.status, body: await response.json() }
}

async function register(label) {
  const response = await fetch(`${base}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}@test.local`,
      password: 'correct horse battery',
      name: label,
      tenantName: `${label} 团队`,
    }),
  })
  return response.json()
}

/**
 * Put an existing user into the owner's tenant as `role`, then mint a token for
 * that tenant (the switch endpoint re-reads the membership on every call).
 * @returns {Promise<string>} access token scoped to the owner's tenant.
 */
async function joinTenant(user, ownToken, tenantId, role) {
  await admin.query(
    `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [tenantId, user.id, role],
  )
  // Switch as the member themselves: the switch endpoint acts on the caller,
  // so passing the owner's token would mint an owner-scoped token.
  const switched = await request('POST', '/v1/auth/switch', ownToken, { tenantId })
  assert.equal(switched.status, 200)
  return switched.body.accessToken
}

/** One tenant with an owner and two agents, each owning a channel and data. */
async function buildTenant() {
  const owner = await register('owner')
  const tenantId = owner.tenants[0].tenant_id
  const agentA = await register('agent-a')
  const agentB = await register('agent-b')
  const tokenA = await joinTenant(agentA.user, agentA.accessToken, tenantId, 'agent')
  const tokenB = await joinTenant(agentB.user, agentB.accessToken, tenantId, 'agent')

  const channelA = await admin.query(
    "INSERT INTO channels (tenant_id, type, name, owner_user_id) VALUES ($1,'whatsapp_cloud','A 的号码',$2) RETURNING id",
    [tenantId, agentA.user.id],
  )
  const channelB = await admin.query(
    "INSERT INTO channels (tenant_id, type, name, owner_user_id) VALUES ($1,'telegram','B 的号码',$2) RETURNING id",
    [tenantId, agentB.user.id],
  )
  const contactA = await admin.query("INSERT INTO contacts (tenant_id, name) VALUES ($1,'A 的客户') RETURNING id", [tenantId])
  const contactB = await admin.query("INSERT INTO contacts (tenant_id, name) VALUES ($1,'B 的客户') RETURNING id", [tenantId])
  const convA = await admin.query(
    `INSERT INTO conversations (tenant_id, channel_id, contact_id, owner_user_id, subject)
     VALUES ($1,$2,$3,$4,'A 的会话') RETURNING id`,
    [tenantId, channelA.rows[0].id, contactA.rows[0].id, agentA.user.id],
  )
  const convB = await admin.query(
    `INSERT INTO conversations (tenant_id, channel_id, contact_id, owner_user_id, subject)
     VALUES ($1,$2,$3,$4,'B 的会话') RETURNING id`,
    [tenantId, channelB.rows[0].id, contactB.rows[0].id, agentB.user.id],
  )
  return {
    tenantId,
    ownerToken: owner.accessToken,
    tokenA,
    tokenB,
    agentA: agentA.user.id,
    agentB: agentB.user.id,
    channelA: channelA.rows[0].id,
    channelB: channelB.rows[0].id,
    convA: convA.rows[0].id,
    convB: convB.rows[0].id,
  }
}

test('a member lists only their own channel numbers', async () => {
  const fixture = await buildTenant()
  const listA = await request('GET', '/v1/channels', fixture.tokenA)
  assert.equal(listA.status, 200)
  assert.deepEqual(listA.body.items.map((item) => item.name), ['A 的号码'])

  const listB = await request('GET', '/v1/channels', fixture.tokenB)
  assert.deepEqual(listB.body.items.map((item) => item.name), ['B 的号码'])
})

test('asking for another member\'s channel is refused without leaking it', async () => {
  const fixture = await buildTenant()
  const refused = await request('GET', `/v1/channels/${fixture.channelB}`, fixture.tokenA)
  assert.equal(refused.status, 403)
  assert.equal(refused.body.error.code, 'out-of-scope')
  assert.equal(JSON.stringify(refused.body).includes('B 的号码'), false)

  // A channel that does not exist at all stays a 404, so 403 means "someone
  // else's", never "missing".
  const missing = await request('GET', '/v1/channels/00000000-0000-0000-0000-000000000001', fixture.tokenA)
  assert.equal(missing.status, 404)
})

test('a member lists and reads only their own conversations', async () => {
  const fixture = await buildTenant()
  const listA = await request('GET', '/v1/conversations', fixture.tokenA)
  assert.equal(listA.status, 200)
  assert.deepEqual(listA.body.items.map((item) => item.id), [fixture.convA])

  const messages = await request('GET', `/v1/conversations/${fixture.convB}/messages`, fixture.tokenA)
  assert.equal(messages.status, 403)
  assert.equal(messages.body.error.code, 'out-of-scope')

  const own = await request('GET', `/v1/conversations/${fixture.convA}/messages`, fixture.tokenA)
  assert.equal(own.status, 200)
})

test('writes cannot land in another member\'s conversation', async () => {
  const fixture = await buildTenant()
  const send = await request('POST', '/v1/messages', fixture.tokenA, {
    conversationId: fixture.convB,
    text: '越权写入',
    clientId: `iso-${Date.now()}`,
  })
  assert.equal(send.status, 403)
  assert.equal(send.body.error.code, 'out-of-scope')

  const patch = await request('PATCH', `/v1/conversations/${fixture.convB}`, fixture.tokenA, { status: 'resolved' })
  assert.equal(patch.status, 403)

  const read = await request('POST', `/v1/conversations/${fixture.convB}/read`, fixture.tokenA, {})
  assert.equal(read.status, 403)

  // The refused send wrote nothing.
  const stored = await admin.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1', [fixture.convB])
  assert.equal(stored.rows[0].n, 0)
})

test('contacts follow the conversations a member can see', async () => {
  const fixture = await buildTenant()
  const listA = await request('GET', '/v1/contacts', fixture.tokenA)
  assert.equal(listA.status, 200)
  assert.deepEqual(listA.body.items.map((item) => item.name), ['A 的客户'])
})

test('the owner sees the whole tenant', async () => {
  const fixture = await buildTenant()
  const channels = await request('GET', '/v1/channels', fixture.ownerToken)
  assert.deepEqual(channels.body.items.map((item) => item.name).sort(), ['A 的号码', 'B 的号码'])

  const conversations = await request('GET', '/v1/conversations', fixture.ownerToken)
  const ids = conversations.body.items.map((item) => item.id)
  assert.ok(ids.includes(fixture.convA) && ids.includes(fixture.convB))

  const other = await request('GET', `/v1/conversations/${fixture.convB}/messages`, fixture.ownerToken)
  assert.equal(other.status, 200)
})

test('a role change applies on the very next request', async () => {
  const fixture = await buildTenant()
  const before = await request('GET', '/v1/channels', fixture.tokenA)
  assert.equal(before.body.items.length, 1)

  await admin.query(
    "UPDATE memberships SET role = 'admin' WHERE tenant_id = $1 AND user_id = (SELECT id FROM users WHERE email LIKE 'agent-a-%' ORDER BY created_at DESC LIMIT 1)",
    [fixture.tenantId],
  )
  const after = await request('GET', '/v1/channels', fixture.tokenA)
  assert.equal(after.status, 200)
  assert.equal(after.body.items.length, 2)
})

test('an owner can widen one member to the whole tenant', async () => {
  const fixture = await buildTenant()
  const before = await request('GET', '/v1/channels', fixture.tokenA)
  assert.equal(before.body.items.length, 1)

  const email = (await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)).body.items
    .find((item) => item.user_id === fixture.agentA).email
  const grant = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, { dataScope: 'all', confirmEmail: email })
  assert.equal(grant.status, 200)
  assert.equal(grant.body.member.permissions.dataScope, 'all')

  const after = await request('GET', '/v1/channels', fixture.tokenA)
  assert.deepEqual(after.body.items.map((item) => item.name).sort(), ['A 的号码', 'B 的号码'])

  const conversation = await request('GET', `/v1/conversations/${fixture.convB}/messages`, fixture.tokenA)
  assert.equal(conversation.status, 200)
})

test('a member can be granted specific channel numbers, and their conversations', async () => {
  const fixture = await buildTenant()
  const grant = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, {
    channelIds: [fixture.channelB],
  })
  assert.equal(grant.status, 200)

  const channels = await request('GET', '/v1/channels', fixture.tokenA)
  assert.deepEqual(channels.body.items.map((item) => item.name).sort(), ['A 的号码', 'B 的号码'])

  // The granted channel carries its conversation, but not someone else's data
  // beyond that grant.
  const granted = await request('GET', `/v1/conversations/${fixture.convB}/messages`, fixture.tokenA)
  assert.equal(granted.status, 200)

  // A conversation on a channel that was NOT granted stays out of reach.
  const ownerChannel = await admin.query(
    "INSERT INTO channels (tenant_id, type, name) VALUES ($1,'webhook','未授权的号码') RETURNING id",
    [fixture.tenantId],
  )
  const ownerContact = await admin.query("INSERT INTO contacts (tenant_id, name) VALUES ($1,'未授权客户') RETURNING id", [fixture.tenantId])
  const ownerConv = await admin.query(
    `INSERT INTO conversations (tenant_id, channel_id, contact_id, subject) VALUES ($1,$2,$3,'未授权会话') RETURNING id`,
    [fixture.tenantId, ownerChannel.rows[0].id, ownerContact.rows[0].id],
  )
  const outsider = await request('GET', `/v1/conversations/${ownerConv.rows[0].id}/messages`, fixture.tokenA)
  assert.equal(outsider.status, 403)
  assert.equal(outsider.body.error.code, 'out-of-scope')
})

test('revoking the grant takes effect on the next request', async () => {
  const fixture = await buildTenant()
  await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, {
    channelIds: [fixture.channelB],
  })
  const widened = await request('GET', '/v1/channels', fixture.tokenA)
  assert.equal(widened.body.items.length, 2)

  await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, {
    channelIds: [],
    dataScope: 'own',
  })
  const narrowed = await request('GET', '/v1/channels', fixture.tokenA)
  assert.deepEqual(narrowed.body.items.map((item) => item.name), ['A 的号码'])
})

test('an agent cannot assign permissions, and unknown channels are rejected', async () => {
  const fixture = await buildTenant()
  const denied = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}`, fixture.tokenA, { dataScope: 'all' })
  assert.equal(denied.status, 403)

  const unknown = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, {
    channelIds: ['00000000-0000-0000-0000-0000000000ff'],
  })
  assert.equal(unknown.status, 422)
  assert.equal(unknown.body.error.code, 'invalid')
})

test('a permission change is audited and the log is admin-only', async () => {
  const fixture = await buildTenant()
  const grant = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, { channelIds: [fixture.channelB] })
  assert.equal(grant.status, 200)

  const audit = await request('GET', `/v1/tenants/${fixture.tenantId}/audit`, fixture.ownerToken)
  assert.equal(audit.status, 200)
  const entry = audit.body.items.find((item) => item.target === fixture.agentA)
  assert.ok(entry, 'the change is recorded')
  assert.equal(entry.action, 'member.permissions')
  assert.deepEqual(entry.detail.grant.channelIds, [fixture.channelB])
  assert.equal(entry.target_email !== undefined, true)

  const denied = await request('GET', `/v1/tenants/${fixture.tenantId}/audit`, fixture.tokenA)
  assert.equal(denied.status, 403)
})

test('role changes and removals are audited, and the log paginates by cursor', async () => {
  const fixture = await buildTenant()
  const rosterB = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const emailB = rosterB.body.items.find((item) => item.user_id === fixture.agentB).email
  const promote = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}`, fixture.ownerToken, { role: 'admin', confirmEmail: emailB })
  assert.equal(promote.status, 200)
  assert.equal(promote.body.member.role, 'admin')

  const rosterA = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const emailA = rosterA.body.items.find((item) => item.user_id === fixture.agentA).email
  const removed = await request('DELETE', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}?confirmEmail=${encodeURIComponent(emailA)}`, fixture.ownerToken)
  assert.equal(removed.status, 200)

  const first = await request('GET', `/v1/tenants/${fixture.tenantId}/audit?limit=1`, fixture.ownerToken)
  assert.equal(first.status, 200)
  assert.equal(first.body.items.length, 1)
  assert.equal(first.body.items[0].action, 'member.remove')

  const next = await request('GET', `/v1/tenants/${fixture.tenantId}/audit?limit=1&before=${first.body.items[0].id}`, fixture.ownerToken)
  assert.equal(next.body.items[0].action, 'member.role')
  assert.notEqual(next.body.items[0].id, first.body.items[0].id)

  // A member who is no longer there answers 404; the owner cannot be removed.
  const again = await request('DELETE', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}?confirmEmail=${encodeURIComponent(emailA)}`, fixture.ownerToken)
  assert.equal(again.status, 404)
})

test('granting the whole tenant alerts the team robot', async () => {
  const fixture = await buildTenant()
  const { createServer } = await import('node:http')
  const received = []
  const robot = createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      received.push(Buffer.concat(chunks).toString('utf8'))
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"errcode":0}')
    })
  })
  await new Promise((resolve) => robot.listen(0, '127.0.0.1', resolve))
  await admin.query(
    `INSERT INTO tenant_notify (tenant_id, enabled, wecom_webhook)
     VALUES ($1, true, $2)
     ON CONFLICT (tenant_id) DO UPDATE SET enabled = true, wecom_webhook = EXCLUDED.wecom_webhook`,
    [fixture.tenantId, `http://127.0.0.1:${robot.address().port}/send`],
  )
  try {
    const email = (await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)).body.items
    .find((item) => item.user_id === fixture.agentA).email
  const grant = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, { dataScope: 'all', confirmEmail: email })
    assert.equal(grant.status, 200)
    for (let attempt = 0; attempt < 20 && received.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(received.length > 0, 'no alert was posted')
    assert.match(received.at(-1), /权限变更/)
    assert.match(received.at(-1), /整个团队/)
  } finally {
    await new Promise((resolve) => robot.close(resolve))
  }
})

test('widening to the whole tenant requires typing the member email', async () => {
  const fixture = await buildTenant()
  const members = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const email = members.body.items.find((item) => item.user_id === fixture.agentA).email

  const missing = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, { dataScope: 'all' })
  assert.equal(missing.status, 422)
  assert.equal(missing.body.error.code, 'confirm-required')

  const wrong = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, { dataScope: 'all', confirmEmail: 'someone@else.test' })
  assert.equal(wrong.status, 422)

  const scope = await request('GET', '/v1/channels', fixture.tokenA)
  assert.equal(scope.body.items.length, 1, 'a refused confirmation must not widen the scope')

  const confirmed = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, { dataScope: 'all', confirmEmail: email.toUpperCase() })
  assert.equal(confirmed.status, 200)
  const widened = await request('GET', '/v1/channels', fixture.tokenA)
  assert.equal(widened.body.items.length, 2)
})

test('giving someone admin also requires the email confirmation', async () => {
  const fixture = await buildTenant()
  const roster = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const email = roster.body.items.find((item) => item.user_id === fixture.agentB).email

  const missing = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}`, fixture.ownerToken, { role: 'admin' })
  assert.equal(missing.status, 422)
  assert.equal(missing.body.error.code, 'confirm-required')

  const still = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  assert.equal(still.body.items.find((item) => item.user_id === fixture.agentB).role, 'agent')

  const confirmed = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}`, fixture.ownerToken, { role: 'admin', confirmEmail: email })
  assert.equal(confirmed.status, 200)
  assert.equal(confirmed.body.member.role, 'admin')
})

test('the audit CSV export is admin only and carries no other tenant rows', async () => {
  const fixture = await buildTenant()
  const roster = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const email = roster.body.items.find((item) => item.user_id === fixture.agentA).email
  await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentA}`, fixture.ownerToken, { dataScope: 'all', confirmEmail: email })

  const csv = await fetch(`${base}/v1/tenants/${fixture.tenantId}/audit.csv`, {
    headers: { authorization: `Bearer ${fixture.ownerToken}` },
  })
  assert.equal(csv.status, 200)
  assert.match(csv.headers.get('content-type') ?? '', /text\/csv/)
  assert.match(csv.headers.get('content-disposition') ?? '', /attachment/)
  const body = await csv.text()
  assert.match(body, /^id,action,created_at,actor_email,target_email,detail/)
  assert.match(body, /member\.permissions/)
  assert.equal(body.includes(email), true)
  // A different tenant's owner gets their own empty export, never these rows.
  const other = await buildTenant()
  const otherCsv = await fetch(`${base}/v1/tenants/${other.tenantId}/audit.csv`, {
    headers: { authorization: `Bearer ${other.ownerToken}` },
  })
  const otherBody = await otherCsv.text()
  assert.equal(otherBody.trim().split('\n').length, 1)

  const denied = await fetch(`${base}/v1/tenants/${fixture.tenantId}/audit.csv`, {
    headers: { authorization: `Bearer ${fixture.tokenA}` },
  })
  assert.equal(denied.status, 403)
})

test('an admin proposal waits for the owner, and the owner can approve or reject', async () => {
  const fixture = await buildTenant()
  const roster = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const emailA = roster.body.items.find((item) => item.user_id === fixture.agentA).email

  // Promote A to admin so it can propose, then have it propose a wide grant for B.
  await admin.query("UPDATE memberships SET role = 'admin' WHERE tenant_id = $1 AND user_id = $2", [fixture.tenantId, fixture.agentA])
  const emailB = roster.body.items.find((item) => item.user_id === fixture.agentB).email
  const proposed = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}`, fixture.tokenA, { dataScope: 'all', confirmEmail: emailB })
  assert.equal(proposed.status, 202)
  assert.equal(proposed.body.pending, true)

  // Nothing applied yet.
  const before = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  assert.equal(before.body.items.find((item) => item.user_id === fixture.agentB).permissions.dataScope ?? 'own', 'own')

  const pending = await request('GET', `/v1/tenants/${fixture.tenantId}/approvals`, fixture.ownerToken)
  assert.equal(pending.status, 200)
  assert.equal(pending.body.items.length, 1)
  const approvalId = pending.body.items[0].id

  // The proposer cannot approve their own request.
  const selfApprove = await request('POST', `/v1/tenants/${fixture.tenantId}/approvals/${approvalId}`, fixture.tokenA, { decision: 'approve' })
  assert.equal(selfApprove.status, 403)

  const approved = await request('POST', `/v1/tenants/${fixture.tenantId}/approvals/${approvalId}`, fixture.ownerToken, { decision: 'approve' })
  assert.equal(approved.status, 200)
  const after = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  assert.equal(after.body.items.find((item) => item.user_id === fixture.agentB).permissions.dataScope, 'all')
})

test('rejecting a proposal leaves the member untouched', async () => {
  const fixture = await buildTenant()
  const roster = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const emailB = roster.body.items.find((item) => item.user_id === fixture.agentB).email
  await admin.query("UPDATE memberships SET role = 'admin' WHERE tenant_id = $1 AND user_id = $2", [fixture.tenantId, fixture.agentA])

  const proposed = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}`, fixture.tokenA, { dataScope: 'all', confirmEmail: emailB })
  assert.equal(proposed.status, 202)
  const pending = await request('GET', `/v1/tenants/${fixture.tenantId}/approvals`, fixture.ownerToken)
  const rejected = await request('POST', `/v1/tenants/${fixture.tenantId}/approvals/${pending.body.items[0].id}`, fixture.ownerToken, { decision: 'reject' })
  assert.equal(rejected.status, 200)
  assert.equal(rejected.body.status, 'rejected')

  const members = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  assert.equal(members.body.items.find((item) => item.user_id === fixture.agentB).permissions.dataScope ?? 'own', 'own')
  const scoped = await request('GET', '/v1/channels', fixture.tokenB)
  assert.equal(scoped.body.items.length, 1)
})

test('an admin removing a member becomes an approval request', async () => {
  const fixture = await buildTenant()
  const roster = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const emailA = roster.body.items.find((item) => item.user_id === fixture.agentA).email
  await admin.query("UPDATE memberships SET role = 'admin' WHERE tenant_id = $1 AND user_id = $2", [fixture.tenantId, fixture.agentA])

  const proposed = await request('DELETE', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}?confirmEmail=${encodeURIComponent(roster.body.items.find((item) => item.user_id === fixture.agentB).email)}`, fixture.tokenA)
  assert.equal(proposed.status, 202)
  assert.equal(proposed.body.pending, true)

  // Still a member until the owner approves.
  const before = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  assert.ok(before.body.items.some((item) => item.user_id === fixture.agentB))

  const pending = await request('GET', `/v1/tenants/${fixture.tenantId}/approvals`, fixture.ownerToken)
  const approval = pending.body.items.find((item) => item.action === 'member.remove')
  assert.ok(approval, 'removal approval is listed')
  const approved = await request('POST', `/v1/tenants/${fixture.tenantId}/approvals/${approval.id}`, fixture.ownerToken, { decision: 'approve' })
  assert.equal(approved.status, 200)

  const after = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  assert.equal(after.body.items.some((item) => item.user_id === fixture.agentB), false)
})

test('channel deletion is guarded, and an admin proposal needs the owner', async () => {
  const fixture = await buildTenant()
  // A channel with conversations cannot be deleted at all.
  const inUse = await request('DELETE', `/v1/channels/${fixture.channelA}`, fixture.ownerToken)
  assert.equal(inUse.status, 409)
  assert.equal(inUse.body.error.code, 'channel-in-use')

  const empty = await admin.query(
    "INSERT INTO channels (tenant_id, type, name) VALUES ($1,'webhook','空渠道') RETURNING id",
    [fixture.tenantId],
  )
  const emptyId = empty.rows[0].id

  // The owner deletes directly; the admin proposes and the owner approves.
  const direct = await admin.query(
    "INSERT INTO channels (tenant_id, type, name) VALUES ($1,'webhook','直删渠道') RETURNING id",
    [fixture.tenantId],
  )
  const deleted = await request('DELETE', `/v1/channels/${direct.rows[0].id}`, fixture.ownerToken)
  assert.equal(deleted.status, 200)

  await admin.query("UPDATE memberships SET role = 'admin' WHERE tenant_id = $1 AND user_id = $2", [fixture.tenantId, fixture.agentA])
  const proposed = await request('DELETE', `/v1/channels/${emptyId}`, fixture.tokenA)
  assert.equal(proposed.status, 202)
  const still = await admin.query('SELECT count(*)::int AS n FROM channels WHERE id = $1', [emptyId])
  assert.equal(still.rows[0].n, 1)

  const pending = await request('GET', `/v1/tenants/${fixture.tenantId}/approvals`, fixture.ownerToken)
  const approval = pending.body.items.find((item) => item.action === 'channel.delete')
  assert.ok(approval, 'the channel removal is listed')
  await request('POST', `/v1/tenants/${fixture.tenantId}/approvals/${approval.id}`, fixture.ownerToken, { decision: 'approve' })
  const gone = await admin.query('SELECT count(*)::int AS n FROM channels WHERE id = $1', [emptyId])
  assert.equal(gone.rows[0].n, 0)
})

test('approval requests keep the target name snapshot and page by cursor', async () => {
  const fixture = await buildTenant()
  await admin.query("UPDATE memberships SET role = 'admin' WHERE tenant_id = $1 AND user_id = $2", [fixture.tenantId, fixture.agentA])
  const roster = await request('GET', `/v1/tenants/${fixture.tenantId}/members`, fixture.ownerToken)
  const emailB = roster.body.items.find((item) => item.user_id === fixture.agentB).email

  const first = await request('PATCH', `/v1/tenants/${fixture.tenantId}/members/${fixture.agentB}`, fixture.tokenA, { dataScope: 'all', confirmEmail: emailB })
  assert.equal(first.status, 202)
  const channel = await admin.query("INSERT INTO channels (tenant_id, type, name) VALUES ($1,'webhook','待删渠道') RETURNING id", [fixture.tenantId])
  const second = await request('DELETE', `/v1/channels/${channel.rows[0].id}`, fixture.tokenA)
  assert.equal(second.status, 202)

  const list = await request('GET', `/v1/tenants/${fixture.tenantId}/approvals?status=all&limit=1`, fixture.ownerToken)
  assert.equal(list.body.items.length, 1)
  const latest = list.body.items[0]
  assert.equal(latest.action, 'channel.delete')
  assert.equal(latest.payload.channelName, '待删渠道')

  const next = await request('GET', `/v1/tenants/${fixture.tenantId}/approvals?status=all&limit=1&before=${encodeURIComponent(latest.created_at)}`, fixture.ownerToken)
  assert.equal(next.body.items[0].action, 'member.permissions')
  assert.equal(next.body.items[0].payload.targetName.length > 0, true)
})

test('search only matches rows inside the member scope', async () => {
  const fixture = await buildTenant()
  const contactB = await admin.query("UPDATE contacts SET name = '独家客户B' WHERE id = (SELECT contact_id FROM conversations WHERE id = $1) RETURNING id", [fixture.convB])
  assert.equal(contactB.rowCount, 1)
  await admin.query("UPDATE conversations SET subject = '蓝海订单查询' WHERE id = $1", [fixture.convB])

  // The owner finds it by contact name and by subject.
  const byContact = await request('GET', '/v1/conversations?q=' + encodeURIComponent('独家客户B'), fixture.ownerToken)
  assert.deepEqual(byContact.body.items.map((item) => item.id), [fixture.convB])
  const bySubject = await request('GET', '/v1/conversations?q=' + encodeURIComponent('蓝海订单'), fixture.ownerToken)
  assert.deepEqual(bySubject.body.items.map((item) => item.id), [fixture.convB])

  // Another member's search returns nothing for that row, and no 403 leak.
  const memberLookup = await request('GET', '/v1/conversations?q=' + encodeURIComponent('独家客户B'), fixture.tokenA)
  assert.equal(memberLookup.status, 200)
  assert.deepEqual(memberLookup.body.items, [])

  // Channel search follows the same policy.
  const channels = await request('GET', '/v1/channels?q=' + encodeURIComponent('B 的号码'), fixture.tokenA)
  assert.deepEqual(channels.body.items, [])
  const own = await request('GET', '/v1/channels?q=' + encodeURIComponent('A 的号码'), fixture.tokenA)
  assert.equal(own.body.items.length, 1)
})
