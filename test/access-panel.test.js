/**
 * The access plugin must register through the client module system (a plain ESM
 * module would never load) and consume the shared core when it is present.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

/** Minimal React stub: the factory only builds components, it never renders. */
const reactStub = {
  createElement: () => null,
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
}

/**
 * Load the access client bundle in a fake module system.
 * @param {{core?: boolean}} [options] - whether a core module is available.
 * @returns {Promise<{registrations: any[], required: string[]}>} what happened.
 */
let cachedRegistration = null
async function load(options = {}) {
  const registrations = []
  const required = []
  if (cachedRegistration === null) {
    globalThis.window = { __ModuleLoader__: { load: (registration) => registrations.push(registration) } }
    await import('../access/client.js')
    cachedRegistration = registrations[0]
  } else {
    registrations.push(cachedRegistration)
  }
  const registration = cachedRegistration
  const exports = registration.factory((name) => {
    required.push(name)
    if (name === 'react') return reactStub
    if (name === 'dsh-im-omni-core' && options.core !== false) {
      return { proxySaas: async () => ({ ok: true, status: 200, json: async () => ({}) }), createTeamInbox: () => ({}), membershipLabel: () => '客服' }
    }
    throw new Error(`cannot resolve ${name}`)
  })
  return { registrations, required, exports }
}

test('registers under the package id and exports apply', async () => {
  const { registrations, exports } = await load()
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].id, 'dsh-im-omni-access')
  assert.equal(typeof exports.apply, 'function')
})

test('asks the module system for core, and survives without it', async () => {
  const withCore = await load({ core: true })
  assert.ok(withCore.required.includes('dsh-im-omni-core'))
  const withoutCore = await load({ core: false })
  assert.equal(typeof withoutCore.exports.apply, 'function')
})
