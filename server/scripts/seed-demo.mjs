#!/usr/bin/env node
/**
 * Seed one demo tenant for screenshots and manual testing.
 *
 * Idempotent: the demo tenant is deleted (cascade) and recreated, while the
 * demo user is reused when it already exists.
 *
 *   node scripts/seed-demo.mjs
 *   email: demo@dsh.local   password: demo12345
 */
import pg from 'pg'
import { hashPassword } from '../src/auth.mjs'

const url = process.env.ADMIN_DATABASE_URL
  ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'
const EMAIL = 'demo@dsh.local'
const PASSWORD = 'demo12345'
const SLUG = 'demo-team'

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query('BEGIN')
  const user = await client.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1, $2, '演示客服')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
     RETURNING id`,
    [EMAIL, await hashPassword(PASSWORD)],
  )
  const userId = user.rows[0].id
  await client.query('DELETE FROM tenants WHERE slug = $1', [SLUG])
  const tenant = await client.query(
    `INSERT INTO tenants (name, slug, plan, status) VALUES ('演示团队', $1, 'team', 'active') RETURNING id`,
    [SLUG],
  )
  const tenantId = tenant.rows[0].id
  await client.query("INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')", [tenantId, userId])
  await client.query("INSERT INTO subscriptions (tenant_id, plan, status, seats) VALUES ($1, 'team', 'active', 5)", [tenantId])

  const wa = await client.query(
    "INSERT INTO channels (tenant_id, type, name, status, health) VALUES ($1,'whatsapp_cloud','售后 WhatsApp','active','ok') RETURNING id",
    [tenantId],
  )
  const tg = await client.query(
    "INSERT INTO channels (tenant_id, type, name, status, health) VALUES ($1,'telegram','社群 Telegram','active','ok') RETURNING id",
    [tenantId],
  )
  const contactIds = []
  for (const person of [
    { name: '林小满', company: '木语家居', hue: 12 },
    { name: 'Aisha Khan', company: 'Northwind', hue: 330 },
    { name: '陈思远', company: '启明电子', hue: 210 },
  ]) {
    const row = await client.query(
      'INSERT INTO contacts (tenant_id, name, company, hue) VALUES ($1, $2, $3, $4) RETURNING id',
      [tenantId, person.name, person.company, person.hue],
    )
    contactIds.push(row.rows[0].id)
  }

  const threads = [
    {
      contact: contactIds[0], channel: wa.rows[0].id, subject: '订单破损退款', unread: 2, status: 'pending',
      messages: [
        ['in', '你好，订单 #4821 已经签收，但其中一件商品有破损。可以申请退款吗？', 26],
        ['out', '你好 Lin，很抱歉收到这样的体验。请拍一张破损处的照片，我这边马上为你处理退款。', 24],
        ['in', '照片已经上传了，另外外箱也压扁了。', 12],
        ['in', '如果退款的话大概多久到账？', 8],
      ],
    },
    {
      contact: contactIds[1], channel: wa.rows[0].id, subject: 'Where is my parcel?', unread: 1, status: 'open',
      messages: [
        ['in', 'Where is my parcel? It was promised last Friday.', 40],
        ['out', 'Hi Aisha, the carrier shows it out for delivery today. I will confirm once it moves.', 35],
        ['in', 'Thanks, please keep me posted.', 6],
      ],
    },
    {
      contact: contactIds[2], channel: tg.rows[0].id, subject: 'API 配额咨询', unread: 0, status: 'open',
      messages: [
        ['in', '我们想确认一下 API 的月度配额是怎么计算的？', 90],
        ['out', '按自然月统计入站与出站消息，超出后会在控制台提示。', 88],
      ],
    },
  ]

  for (const thread of threads) {
    const conversation = await client.query(
      `INSERT INTO conversations
         (tenant_id, channel_id, contact_id, subject, status, priority, unread, tags, last_inbound_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'normal', $6, $7, now() - ($8 || ' minutes')::interval, now() - ($8 || ' minutes')::interval)
       RETURNING id`,
      [tenantId, thread.channel, thread.contact, thread.subject, thread.status, thread.unread,
        thread.subject.includes('退款') ? ['退款', '破损'] : [], thread.messages[0][2]],
    )
    const conversationId = conversation.rows[0].id
    for (const [direction, body, minutesAgo] of thread.messages) {
      await client.query(
        `INSERT INTO messages (tenant_id, conversation_id, direction, kind, body, status, created_at)
         VALUES ($1, $2, $3, 'text', $4, $5, now() - ($6 || ' minutes')::interval)`,
        [tenantId, conversationId, direction, body, direction === 'in' ? 'received' : 'sent', minutesAgo],
      )
    }
  }

  await client.query(
    `INSERT INTO usage_events (tenant_id, type, quantity) VALUES ($1,'message',36), ($1,'ai',4)`,
    [tenantId],
  )
  await client.query('COMMIT')
  console.log(`seeded tenant=${tenantId} user=${EMAIL} password=${PASSWORD}`)
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await client.end()
}
