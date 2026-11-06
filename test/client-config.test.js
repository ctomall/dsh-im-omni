/**
 * Guard for the plugin-detail config component: every state setter it calls must
 * be declared inside it. A setter that lands in another component throws at
 * render time and blanks the section (the error boundary shows "confirming is
 * not defined" instead of the form), which is hard to catch without this scan.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Extract one function body by brace matching. */
function functionBody(source, signature) {
  const start = source.indexOf(signature)
  assert.ok(start >= 0, `${signature} not found`)
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`${signature} is not closed`)
}

test('every setter used by PluginConfigSection is declared in it', async () => {
  const source = await readFile(join(root, 'client.js'), 'utf8')
  const body = functionBody(source, '    function PluginConfigSection() {')
  const declared = new Set([...body.matchAll(/const \[\w+, (set\w+)\] = React\.useState/g)].map((match) => match[1]))
  const used = new Set([...body.matchAll(/\b(set[A-Z]\w*)\s*\(/g)].map((match) => match[1]))
  const globals = new Set(['setTimeout'])
  const missing = [...used].filter((name) => !declared.has(name) && !globals.has(name))
  assert.deepEqual(missing, [], `undeclared setters would throw at render: ${missing.join(', ')}`)
})

test('the component is registered as a keyed bundle config entry', async () => {
  const source = await readFile(join(root, 'client.js'), 'utf8')
  assert.match(source, /name: 'plugins\.bundle\.config'[\s\S]{0,120}key: 'dsh-im-omni'/)
})
