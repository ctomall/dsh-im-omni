#!/usr/bin/env node
/**
 * Entry point: start the multi-tenant HTTP app.
 */
import { closeDb } from './db.mjs'
import { createApp } from './app.mjs'
import { closeDispatch, startDispatcher } from './dispatch.mjs'

const PORT = Number(process.env.PORT ?? 8090)
const server = createApp()

const stopDispatcher = process.env.DISPATCH_ENABLED === 'false' ? () => {} : startDispatcher()

server.listen(PORT, '127.0.0.1', () => {
  console.log(`im-omni-server listening on http://127.0.0.1:${PORT} (dispatch every ${process.env.DISPATCH_INTERVAL_MS ?? 3000}ms)`)
})

/** Drain in-flight requests, then close the pool. */
async function shutdown() {
  stopDispatcher()
  server.close()
  await closeDb()
  await closeDispatch()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
