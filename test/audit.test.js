/**
 * Upgrade audit records: kept on the workspace beyond the event-stream window,
 * trimmed to the last MAX_UPGRADES entries, and mirrored into the event stream.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_UPGRADES, recordUpgrade } from '../lib/audit.js'

/** Minimal store double. */
function fakeStore() {
  const state = { workspace: { currentAgentId: 'agent_you' }, events: [] }
  return {
    state,
    event(type, text, refs) {
      state.events.push({ type, text, actorId: refs?.actorId ?? null })
    },
  }
}

test('a changed upgrade is recorded on the workspace and the event stream', () => {
  const store = fakeStore()
  const record = recordUpgrade(store, { changed: true, before: { short: 'aaaa111' }, after: { short: 'bbbb222' }, changedFiles: ['a.js', 'b.js'], restartRequired: true })
  assert.equal(record.from, 'aaaa111')
  assert.equal(record.to, 'bbbb222')
  assert.equal(record.changedFiles, 2)
  assert.equal(store.state.workspace.upgrades.length, 1)
  assert.equal(store.state.events[0].type, 'plugin.upgraded')
  assert.equal(store.state.events[0].actorId, 'agent_you')
})

test('an unchanged result records nothing', () => {
  const store = fakeStore()
  assert.equal(recordUpgrade(store, { changed: false }), null)
  assert.equal((store.state.workspace.upgrades ?? []).length, 0)
  assert.equal(store.state.events.length, 0)
})

test('the workspace keeps only the newest MAX_UPGRADES records', () => {
  const store = fakeStore()
  for (let index = 0; index < MAX_UPGRADES + 5; index += 1) {
    recordUpgrade(store, { changed: true, before: { short: `f${index}` }, after: { short: `t${index}` } })
  }
  assert.equal(store.state.workspace.upgrades.length, MAX_UPGRADES)
  assert.equal(store.state.workspace.upgrades.at(-1).to, `t${MAX_UPGRADES + 4}`)
  assert.equal(store.state.workspace.upgrades[0].to, 't5')
})
