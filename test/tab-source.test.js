/**
 * Which data source each tab reads: inbox/contacts from the team service, the
 * rest from the local Host workspace until they migrate. Mixing them up crashed
 * 数据分析 and 设置 with "analytics is not defined" style errors.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

test('App picks the team workspace for inbox, contacts and channels', () => {
  assert.match(source, /const active = tab === 'inbox' \|\| tab === 'contacts' \|\| tab === 'channels' \? teamWorkspace : hostWorkspace/)
})

test('the login gate is checked before any workspace loading state', () => {
  const gate = source.indexOf("if (gate.session === null) {")
  const loading = source.indexOf('if (active.loading) {')
  assert.ok(gate > 0 && loading > 0, 'both blocks exist')
  assert.ok(gate < loading, 'gate must come first so a logged-out panel never shows a data error')
})

test('the analytics and settings views keep reading the Host snapshot', () => {
  const analytics = source.indexOf('page = h(AnalyticsView, { snapshot, t })')
  assert.ok(analytics > 0)
  const settings = source.indexOf('page = h(SettingsView, { snapshot, t, command: active.command')
  assert.ok(settings > 0, 'settings is wired to the Host command surface')
})
