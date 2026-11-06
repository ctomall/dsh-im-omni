#!/usr/bin/env node
/**
 * Entry point: start the multi-tenant HTTP app.
 */
import { closeDb } from './db.mjs'
import { createApp } from './app.mjs'
import { closeDispatch, startDispatcher } from './dispatch.mjs'
import { remindStaleApprovals } from './approvals.mjs'

const PORT = Number(process.env.PORT ?? 8090)
const server = createApp()

const stopDispatcher = process.env.DISPATCH_ENABLED === 'false' ? () => {} : startDispatcher()

// Once an hour, nudge owners about approvals that have waited over a day.
const reminderInterval = Number(process.env.APPROVAL_REMINDER_MS ?? 60 * 60 * 1000)
const reminderTimer = reminderInterval > 0
  ? setInterval(() => {
    void remindStaleApprovals().catch((error) => {
      console.warn('approval reminder failed:', error instanceof Error ? error.message : String(error))
    })
  }, reminderInterval)
  : null

server.listen(PORT, '127.0.0.1', () => {
  console.log(`im-omni-server listening on http://127.0.0.1:${PORT} (dispatch every ${process.env.DISPATCH_INTERVAL_MS ?? 3000}ms)`)
})

/** Drain in-flight requests, then close the pool. */
async function shutdown() {
  stopDispatcher()
  if (reminderTimer !== null) clearInterval(reminderTimer)
  server.close()
  await closeDb()
  await closeDispatch()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
