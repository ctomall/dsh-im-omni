/**
 * The shared client module must produce the same mapping as the tested library,
 * otherwise the two plugins would render different shapes from the same rows.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toConversation, toMessage } from '../lib/team-inbox.mjs'

/** Load the browser module entry once, capturing what it registers. */
let cached = null
async function loadCore() {
  if (cached !== null) return cached
  const registrations = []
  globalThis.window = {
    __ModuleLoader__: {
      load(registration) {
        registrations.push(registration)
      },
    },
  }
  await import('../core/client.js').catch(() => {})
  cached = registrations
  return cached
}

test('core registers itself under the package id', async () => {
  const registrations = await loadCore()
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].id, 'dsh-im-omni-core')
  const exports = registrations[0].factory()
  for (const name of ['proxySaas', 'toConversation', 'toMessage', 'membershipLabel', 'createTeamInbox']) {
    assert.equal(typeof exports[name], 'function', `${name} is exported`)
  }
})

test('the core mapping matches the library mapping', async () => {
  const [registration] = await loadCore()
  const { toConversation: coreConversation, toMessage: coreMessage, membershipLabel } = registration.factory()
  const row = {
    id: 'c1', channel_id: 'ch1', contact_id: 'ct1', subject: '退款', status: 'open',
    priority: 'high', unread: 3, tags: ['退款'], updated_at: '2026-11-06T01:00:00Z',
  }
  assert.deepEqual(JSON.parse(JSON.stringify(coreConversation(row))), JSON.parse(JSON.stringify(toConversation(row))))
  const message = { id: 'm1', conversation_id: 'c1', direction: 'outbound', body: 'hi', created_at: '2026-11-06T01:00:00Z' }
  assert.deepEqual(JSON.parse(JSON.stringify(coreMessage(message))), JSON.parse(JSON.stringify(toMessage(message))))
  assert.equal(membershipLabel('owner'), '所有者')
  assert.equal(membershipLabel('agent'), '客服')
})
