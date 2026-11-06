/**
 * Shared fixture: one channel, one contact and one conversation for a tenant.
 * The create endpoints do not exist yet, so tests write rows directly and then
 * exercise the HTTP API.
 * @module test/support/fixture
 */

/**
 * Insert a conversation (with the channel and contact it needs).
 * @param {import('pg').Client} admin - privileged client.
 * @param {string} tenantId - tenant uuid.
 * @param {string|null} [ownerUserId] - owner for per-member scope; null = tenant owner.
 * @returns {Promise<string>} conversation id.
 */
export async function seedConversation(admin, tenantId, ownerUserId = null) {
  const channel = await admin.query(
    "INSERT INTO channels (tenant_id, type, name, owner_user_id) VALUES ($1,'telegram','测试渠道',$2) RETURNING id",
    [tenantId, ownerUserId],
  )
  const contact = await admin.query(
    "INSERT INTO contacts (tenant_id, name) VALUES ($1,'测试客户') RETURNING id",
    [tenantId],
  )
  const conversation = await admin.query(
    `INSERT INTO conversations (tenant_id, channel_id, contact_id, owner_user_id, subject)
     VALUES ($1,$2,$3,$4,'测试会话') RETURNING id`,
    [tenantId, channel.rows[0].id, contact.rows[0].id, ownerUserId],
  )
  return conversation.rows[0].id
}
