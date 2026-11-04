#!/usr/bin/env node
/**
 * Entry point: start the multi-tenant HTTP app.
 */
import { closeDb } from './db.mjs'
import { createApp } from './app.mjs'

const PORT = Number(process.env.PORT ?? 8090)
const server = createApp()

server.listen(PORT, '127.0.0.1', () => {
  console.log(`im-omni-server listening on http://127.0.0.1:${PORT}`)
})

/** Drain in-flight requests, then close the pool. */
async function shutdown() {
  server.close()
  await closeDb()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
