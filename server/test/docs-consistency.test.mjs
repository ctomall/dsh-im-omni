/**
 * The documentation must not drift from the routes.
 *
 * Routes are normalised (`/v1/devices/([0-9a-f-]{36})` -> `/v1/devices/{id}`)
 * and compared with the endpoint list in docs/API-v1.md, whose brace groups
 * (`{code,link,register}`) are expanded first.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appSource = await readFile(join(here, '..', 'src', 'app.mjs'), 'utf8')
const apiDoc = await readFile(join(here, '..', '..', 'docs', 'API-v1.md'), 'utf8')

/** Expand `{a,b,c}` groups into every concrete path. */
function expand(path) {
  const match = /\{([a-z0-9,]+)\}/i.exec(path)
  if (match === null) return [path]
  const [whole, inner] = match
  // `{a,b}` is an enumeration; a single `{id}` is a path parameter and stays.
  if (!inner.includes(',')) return [path]
  return inner.split(',').flatMap((option) => expand(path.replace(whole, option)))
}

/** Normalise a declared route to the documented shape. */
function normalise(routePath) {
  return routePath
    .replace(/\(\[0-9a-f-\]\{36\}\)/g, '{id}')
    .replace(/\(\[0-9a-z-\]\+\)/g, '{id}')
}

const routes = [...appSource.matchAll(/route\('([A-Z]+)',\s*'([^']+)'/g)].map((match) => ({
  method: match[1],
  key: `${match[1]} ${normalise(match[2])}`,
}))

const documented = [...apiDoc.matchAll(/`(GET|POST|PATCH|DELETE) (\/v1\/[^`]+|\/healthz|\/metrics)`/g)]
  .flatMap((match) => expand(match[2]).map((path) => `${match[1]} ${path}`))

test('every implemented route appears in the API document', () => {
  const missing = routes.filter(({ key }) => !documented.includes(key))
  assert.deepEqual(missing.map((item) => item.key), [], 'undocumented routes')
})

test('the document does not claim unimplemented routes as implemented', () => {
  const docRoutes = [...apiDoc.matchAll(/`(GET|POST|PATCH|DELETE) (\/v1\/[^`]+|\/healthz|\/metrics)`/g)]
    .flatMap((match) => expand(match[2]).map((path) => `${match[1]} ${path}`))
  const unknown = docRoutes.filter((key) => !routes.some((route) => route.key === key))
  // Planned endpoints are allowed, but only outside the "✅ 已实现" table rows.
  const wronglyImplemented = unknown.filter((key) => {
    const row = apiDoc.split('\n').find((line) => line.includes(key.split(' ')[1]) && line.includes('✅'))
    return row !== undefined
  })
  assert.deepEqual(wronglyImplemented, [], 'documented as implemented but missing from app.mjs')
})

test('the document states both implemented and planned coverage', () => {
  assert.match(apiDoc, /✅ 已实现/)
  assert.match(apiDoc, /⏳ 规划中/)
})
