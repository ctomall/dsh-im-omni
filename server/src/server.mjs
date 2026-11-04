#!/usr/bin/env node
/**
 * Minimal HTTP surface for the multi-tenant backend.
 *
 * S0 scope: health plus a tenant-scoped read that proves the RLS path works end
 * to end. Authentication (JWT/refresh) and the full /v1 surface land in S1 —
 * until then the tenant comes from an explicit header and the server refuses to
 * start outside development.
 */
import { createServer } from 'node:http'
import { withTenant } from './db.mjs'

const PORT = Number(process.env.PORT ?? 8090)
const VERSION = '0.1.0'

/** @param {import('node:http').ServerResponse} response - response. */
function json(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/healthz') {
    json(response, 200, { ok: true, version: VERSION })
    return
  }

  if (url.pathname === '/v1/conversations' && request.method === 'GET') {
    const tenant = request.headers['x-tenant-id']
    if (typeof tenant !== 'string' || tenant === '') {
      json(response, 401, { error: { code: 'tenant-required', message: 'X-Tenant-Id is required (dev only).' } })
      return
    }
    try {
      const rows = await withTenant(tenant, async (client) => {
        const result = await client.query(
          `SELECT c.id, c.subject, c.status, c.updated_at
             FROM conversations c
            ORDER BY c.updated_at DESC
            LIMIT 50`,
        )
        return result.rows
      })
      json(response, 200, { items: rows })
    } catch (error) {
      json(response, 500, { error: { code: 'server-error', message: error instanceof Error ? error.message : String(error) } })
    }
    return
  }

  json(response, 404, { error: { code: 'not-found', message: 'Unknown route.' } })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`im-omni-server ${VERSION} listening on http://127.0.0.1:${PORT}`)
})
