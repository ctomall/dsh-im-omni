/**
 * Permission-consistent analytics.
 *
 * Every query runs inside the member's row policies, so the numbers describe what
 * that member may see — never the whole tenant unless the member may see it.
 * @module im-omni-server/analytics
 */

/**
 * Compute the summary the panel renders.
 * @param {import('pg').PoolClient} client - client already inside the member context.
 * @returns {Promise<Record<string, any>>} summary.
 */
export async function summaryFor(client) {
  const totals = await client.query(`
    SELECT
      count(*) FILTER (WHERE status <> 'closed')::int AS open,
      count(*) FILTER (WHERE unread > 0)::int AS awaiting,
      count(*) FILTER (WHERE status = 'closed' AND updated_at >= date_trunc('day', now()))::int AS resolved_today,
      count(*) FILTER (WHERE 'breached' = ANY(tags))::int AS breached,
      count(DISTINCT contact_id)::int AS contacts
    FROM conversations
  `)

  const messages = await client.query(`
    SELECT count(*)::int AS total,
           coalesce(avg(EXTRACT(EPOCH FROM (first_out.created_at - first_in.created_at))) FILTER (WHERE first_out.created_at IS NOT NULL), 0)::int AS avg_first_response
      FROM messages m
      LEFT JOIN LATERAL (
        SELECT min(created_at) AS created_at FROM messages
         WHERE conversation_id = m.conversation_id AND direction = 'inbound'
      ) first_in ON true
      LEFT JOIN LATERAL (
        SELECT min(created_at) AS created_at FROM messages
         WHERE conversation_id = m.conversation_id AND direction = 'outbound'
      ) first_out ON true
  `)

  const volume = await client.query(`
    SELECT to_char(day, 'YYYY-MM-DD') AS date,
           coalesce(count(m.id), 0)::int AS total,
           coalesce(count(m.id) FILTER (WHERE m.direction = 'inbound'), 0)::int AS inbound,
           coalesce(count(m.id) FILTER (WHERE m.direction = 'outbound'), 0)::int AS outbound
      FROM generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') day
      LEFT JOIN messages m ON m.created_at >= day AND m.created_at < day + interval '1 day'
     GROUP BY day
     ORDER BY day
  `)

  const channels = await client.query(`
    SELECT c.id, c.name,
           count(*) FILTER (WHERE m.direction = 'inbound')::int AS inbound,
           count(*) FILTER (WHERE m.direction = 'outbound')::int AS outbound
      FROM messages m
      JOIN conversations v ON v.id = m.conversation_id
      JOIN channels c ON c.id = v.channel_id
     GROUP BY c.id, c.name
     ORDER BY (count(*)) DESC
     LIMIT 8
  `)

  const agents = await client.query(`
    SELECT u.id, coalesce(u.name, u.email) AS name,
           count(*) FILTER (WHERE v.status <> 'closed')::int AS open,
           count(*) FILTER (WHERE v.status = 'closed')::int AS closed
      FROM conversations v
      LEFT JOIN users u ON u.id = v.owner_user_id
     GROUP BY u.id, u.name, u.email
     ORDER BY open DESC
     LIMIT 8
  `)

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      open: totals.rows[0].open,
      awaiting: totals.rows[0].awaiting,
      breached: totals.rows[0].breached,
      resolvedToday: totals.rows[0].resolved_today,
      contacts: totals.rows[0].contacts,
      messages7d: messages.rows[0]?.total ?? 0,
      avgFirstResponseSeconds: messages.rows[0]?.avg_first_response ?? 0,
      avgResolutionSeconds: 0,
    },
    volume: volume.rows,
    channels: channels.rows,
    agents: agents.rows.map((row) => ({ id: row.id, name: row.name ?? '未分配', open: row.open, closed: row.closed })),
  }
}
