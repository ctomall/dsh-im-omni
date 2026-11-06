/**
 * Pure panel rules: which tabs a role may open. Extracted because a missing
 * binding here once left the whole panel showing "items is not defined".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

/** Stub React: the factory only defines components. */
const reactStub = {
  createElement: () => null,
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  Component: class {},
}

/** Load the chat bundle in a fake module system and return what it exports. */
let cached = null
async function loadFactory() {
  if (cached !== null) return cached
  const registrations = []
  globalThis.window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
  await import('../client.js')
  cached = registrations[0].factory((name) => {
    if (name === 'react') return reactStub
    throw new Error(`unexpected require: ${name}`)
  })
  return cached
}

test('owners and admins keep every tab', async () => {
  const { tabItems } = await loadFactory()
  const ids = tabItems('owner', 3).map(([id]) => id)
  assert.deepEqual(ids, ['inbox', 'contacts', 'channels', 'templates', 'broadcasts', 'automation', 'analytics', 'settings'])
  assert.deepEqual(tabItems('admin').map(([id]) => id), ids)
})

test('agents lose channel, broadcast and automation tabs', async () => {
  const { tabItems } = await loadFactory()
  const ids = tabItems('agent').map(([id]) => id)
  assert.deepEqual(ids, ['inbox', 'contacts', 'templates', 'analytics', 'settings'])
  assert.equal(ids.includes('channels'), false)
})

test('the inbox carries the unread badge and roles get labels', async () => {
  const { tabItems, membershipLabel } = await loadFactory()
  assert.equal(tabItems('agent', 7)[0][2], 7)
  assert.equal(membershipLabel('owner'), '所有者')
  assert.equal(membershipLabel('viewer'), '只读')
  assert.equal(membershipLabel('agent'), '客服')
})
