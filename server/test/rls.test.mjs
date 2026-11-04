/**
 * The isolation guarantee: two tenants in one database, and neither can see the
 * other's conversations even when the query forgets a WHERE clause.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { closeDb, withTenant } from '../src/db.mjs'

const adminUrl = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'
const appUrl = process.env.DATABASE_URL
  ?? 'postgresql://im_omni_app:app_dev_pw@127.0.0.1:5432/im_omni_dev'

/** @type {pg.Client} */
let admin
/** @type {{tenantA: string, tenantB: string, contactA: string, contactB: string, channelA: string, channelB: string}} */
const ids = {}

before(async () => {
  admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  // Clean slate for the fixtures only (schema_migrations and RLS stay).
  await admin.query('ALTER TABLE conversations DISABLE ROW LEVEL SECURITY')
  await admin.query('ALTER TABLE contacts DISABLE ROW LEVEL SECURITY')
  await admin.query('ALTER TABLE channels DISABLE ROW LEVEL SECURITY')
  await admin.query('ALTER TABLE messages DISABLE ROW LEVEL SECURITY')
  await admin.query(`DELETE FROM conversations WHERE subject LIKE 'rls-%'`)
  await admin.query(`DELETE FROM contacts WHERE name LIKE 'rls-%'`)
  await admin.query(`DELETE FROM channels WHERE name LIKE 'rls-%'`)
  const tenants = await admin.query(`
    INSERT INTO tenants (name, slug) VALUES ('RLS A', 'rls-a'), ('RLS B', 'rls-b')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, slug`)
  ids.tenantA = tenants.rows.find((row) => row.slug === 'rls-a').id
  ids.tenantB = tenants.rows.find((row) => row.slug === 'rls-b').id
  const contacts = await admin.query(`
    INSERT INTO contacts (tenant_id, name) VALUES ($1,'rls-A'), ($2,'rls-B') RETURNING id, name`,
  [ids.tenantA, ids.tenantB])
  ids.contactA = contacts.rows.find((row) => row.name === 'rls-A').id
  ids.contactB = contacts.rows.find((row) => row.name === 'rls-B').id
  const channels = await admin.query(`
    INSERT INTO channels (tenant_id, type, name) VALUES ($1,'web','rls-A'), ($2,'web','rls-B') RETURNING id, name`,
  [ids.tenantA, ids.tenantB])
  ids.channelA = channels.rows.find((row) => row.name === 'rls-A').id
  ids.channelB = channels.rows.find((row) => row.name === 'rls-B').id
  await admin.query(`
    INSERT INTO conversations (tenant_id, channel_id, contact_id, subject)
    VALUES ($1,$2,$3,'rls-A thread'), ($4,$5,$6,'rls-B thread')`,
  [ids.tenantA, ids.channelA, ids.contactA, ids.tenantB, ids.channelB, ids.contactB])
  await admin.query('ALTER TABLE conversations ENABLE ROW LEVEL SECURITY')
  await admin.query('ALTER TABLE contacts ENABLE ROW LEVEL SECURITY')
  await admin.query('ALTER TABLE channels ENABLE ROW LEVEL SECURITY')
  await admin.query('ALTER TABLE messages ENABLE ROW LEVEL SECURITY')
})

after(async () => {
  await admin?.end()
  await closeDb()
})

test('a tenant sees only its own conversations', async () => {
  const rows = await withTenant(ids.tenantA, async (client) => {
    const result = await client.query('SELECT subject FROM conversations')
    return result.rows.map((row) => row.subject)
  })
  assert.deepEqual(rows, ['rls-A thread'])
})

test('an unfiltered query still cannot cross tenants', async () => {
  const seen = new Set()
  for (const tenant of [ids.tenantA, ids.tenantB]) {
    const rows = await withTenant(tenant, async (client) => {
      const result = await client.query('SELECT DISTINCT tenant_id::text AS t FROM conversations')
      return result.rows.map((row) => row.t)
    })
    rows.forEach((row) => seen.add(row))
  }
  assert.deepEqual([...seen].sort(), [ids.tenantA, ids.tenantB].sort())
})

test('writing a row for another tenant is rejected', async () => {
  await assert.rejects(
    withTenant(ids.tenantA, async (client) => {
      await client.query(
        `INSERT INTO conversations (tenant_id, channel_id, contact_id, subject)
         VALUES ($1,$2,$3,'rls-cross')`,
        [ids.tenantB, ids.channelB, ids.contactB],
      )
    }),
    /row-level security|new row violates/i,
  )
})

test('a transaction without a tenant sees nothing', async () => {
  const client = new pg.Client({ connectionString: appUrl })
  await client.connect()
  try {
    const result = await client.query('SELECT count(*)::int AS n FROM conversations')
    assert.equal(result.rows[0].n, 0)
  } finally {
    await client.end()
  }
})

test('message idempotency is unique per tenant', async () => {
  // Unique per run so repeated test executions start clean.
  const clientId = `client-${Date.now()}`
  const first = await withTenant(ids.tenantA, async (client) => {
    const message = await client.query(
      `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, client_id)
       VALUES ($1,$2,'out','text','hello',$3) RETURNING id`,
      [ids.tenantA, '00000000-0000-0000-0000-000000000001', clientId],
    )
    await client.query(
      `INSERT INTO client_requests (tenant_id, client_id, message_id) VALUES ($1,$2,$3)`,
      [ids.tenantA, clientId, message.rows[0].id],
    )
    return message.rows[0].id
  })
  assert.ok(first)

  await assert.rejects(
    withTenant(ids.tenantA, async (client) => {
      await client.query(
        `INSERT INTO client_requests (tenant_id, client_id, message_id) VALUES ($1,$2,gen_random_uuid())`,
        [ids.tenantA, clientId],
      )
    }),
    /duplicate key/i,
  )
})
