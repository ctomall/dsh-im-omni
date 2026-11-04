/**
 * Self-upgrade tests: status comparison and the guarded fast-forward pull.
 * Run with: node --test test/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { UpgradeError, applyUpgrade, checkUpgrade } from '../lib/upgrade.js'

/** Build a fake package directory that looks like a Git checkout. */
async function checkout(version = '2.7.0') {
  const root = await mkdtemp(path.join(tmpdir(), 'omni-upgrade-'))
  await mkdir(path.join(root, '.git'), { recursive: true })
  await writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'dsh-im-omni', version }))
  return root
}

/** Answer git invocations from a table of matchers. */
function fakeGit(table, calls = []) {
  return async (command, args) => {
    assert.equal(command, 'git')
    const line = args.join(' ')
    calls.push(line)
    for (const [match, reply] of table) {
      if (match(args, line)) {
        if (reply instanceof Error) throw reply
        const value = typeof reply === 'function' ? reply(args, line) : reply
        if (value !== null && typeof value === 'object' && 'stdout' in value) return value
        return { stdout: value, stderr: '' }
      }
    }
    throw Object.assign(new Error(`unexpected git call: ${line}`), { stderr: `unexpected git call: ${line}` })
  }
}

/** The commit description `git log -1 --format=… <rev>` would print. */
const describeOf = (sha, subject) => `${sha}\u0000${sha.slice(0, 7)}\u0000${subject}\u00002026-11-04T08:00:00+08:00`

test('a checkout behind its upstream reports the commits to pull', async () => {
  const root = await checkout('2.7.0')
  try {
    const exec = fakeGit([
      [(a) => a.includes('--symbolic-full-name'), 'origin/main'],
      [(a) => a.join(' ') === 'rev-parse --abbrev-ref HEAD', 'main'],
      [(a) => a[0] === 'log' && a.at(-1) === 'HEAD', describeOf('1111111aaaa', 'local work')],
      [(a) => a[0] === 'status', ''],
      [(a) => a[0] === 'fetch', ''],
      [(a) => a[0] === 'log' && a.at(-1) === 'origin/main', describeOf('2222222bbbb', 'remote head')],
      [(a) => a[0] === 'rev-list', '0\t3'],
      [(a) => a[0] === 'log' && a.includes('HEAD..origin/main'), 'aaa1111 feat: one\nbbb2222 fix: two'],
    ])
    const status = await checkUpgrade({ root, exec })
    assert.equal(status.repo, true)
    assert.equal(status.version, '2.7.0')
    assert.equal(status.branch, 'main')
    assert.equal(status.upstream, 'origin/main')
    assert.equal(status.current.short, '1111111')
    assert.equal(status.remote.short, '2222222')
    assert.equal(status.behind, 3)
    assert.equal(status.ahead, 0)
    assert.equal(status.canPull, true)
    assert.deepEqual(status.commits, ['aaa1111 feat: one', 'bbb2222 fix: two'])
    assert.match(status.message, /落后远程 3 个提交/)
    assert.deepEqual(status.dirtyFiles, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a dirty or diverged checkout cannot be pulled', async () => {
  const root = await checkout()
  try {
    const dirtyExec = fakeGit([
      [(a) => a.includes('--symbolic-full-name'), 'origin/main'],
      [(a) => a.join(' ') === 'rev-parse --abbrev-ref HEAD', 'main'],
      [(a) => a[0] === 'log' && a.at(-1) === 'HEAD', describeOf('1111111aaaa', 'local')],
      [(a) => a[0] === 'status', ' M index.js\n?? notes.md'],
      [(a) => a[0] === 'fetch', ''],
      [(a) => a[0] === 'log' && a.at(-1) === 'origin/main', describeOf('2222222bbbb', 'remote')],
      [(a) => a[0] === 'rev-list', '1\t2'],
      [(a) => a[0] === 'log' && a.includes('HEAD..origin/main'), 'ccc3333 chore: three'],
    ])
    const status = await checkUpgrade({ root, exec: dirtyExec })
    assert.equal(status.behind, 2)
    assert.equal(status.ahead, 1)
    assert.equal(status.canPull, false)
    assert.deepEqual(status.dirtyFiles, ['M index.js', '?? notes.md'])
    assert.match(status.message, /未提交改动/)

    await assert.rejects(
      applyUpgrade({ root, exec: dirtyExec }),
      (error) => error instanceof UpgradeError && error.code === 'dirty-worktree',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the pull fast-forwards, then reports what changed and that a reload is needed', async () => {
  const root = await checkout('2.7.0')
  let pulled = false
  try {
    const exec = fakeGit([
      [(a) => a.includes('--symbolic-full-name'), 'origin/main'],
      [(a) => a.join(' ') === 'rev-parse --abbrev-ref HEAD', 'main'],
      [(a) => a[0] === 'log' && a.at(-1) === 'HEAD', () => describeOf(pulled ? '2222222bbbb' : '1111111aaaa', pulled ? 'new head' : 'old head')],
      [(a) => a[0] === 'status', ''],
      [(a) => a[0] === 'fetch', ''],
      [(a) => a[0] === 'log' && a.at(-1) === 'origin/main', describeOf('2222222bbbb', 'new head')],
      [(a) => a[0] === 'rev-list', () => (pulled ? '0\t0' : '0\t1')],
      [(a) => a[0] === 'log' && a.includes('HEAD..origin/main'), 'ddd4444 feat: new thing'],
      [(a) => a[0] === 'pull', () => {
        pulled = true
        return 'Fast-forward\n client.js | 4 ++--'
      }],
      [(a) => a[0] === 'diff' && a.includes('--name-only'), 'client.js\npackage.json\nlib/upgrade.js'],
    ])
    const result = await applyUpgrade({ root, exec })
    assert.equal(result.changed, true)
    assert.equal(result.before.short, '1111111')
    assert.equal(result.after.short, '2222222')
    assert.equal(result.restartRequired, true)
    assert.equal(result.packageChanged, true)
    assert.equal(result.clientChanged, true)
    assert.deepEqual(result.changedFiles, ['client.js', 'package.json', 'lib/upgrade.js'])
    assert.match(result.message, /需要重载插件/)
    assert.match(result.message, /硬刷新/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an already-current checkout is not pulled', async () => {
  const root = await checkout()
  const calls = []
  try {
    const exec = fakeGit([
      [(a) => a.includes('--symbolic-full-name'), 'origin/main'],
      [(a) => a.join(' ') === 'rev-parse --abbrev-ref HEAD', 'main'],
      [(a) => a[0] === 'log' && a.at(-1) === 'HEAD', describeOf('1111111aaaa', 'head')],
      [(a) => a[0] === 'status', ''],
      [(a) => a[0] === 'fetch', ''],
      [(a) => a[0] === 'log' && a.at(-1) === 'origin/main', describeOf('1111111aaaa', 'head')],
      [(a) => a[0] === 'rev-list', '0\t0'],
    ], calls)
    const result = await applyUpgrade({ root, exec })
    assert.equal(result.changed, false)
    assert.equal(result.restartRequired, false)
    assert.ok(!calls.includes('pull --ff-only --no-rebase origin main'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a plain package directory reports that it cannot self-update', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omni-pkg-'))
  try {
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'dsh-im-omni', version: '2.7.0' }))
    const status = await checkUpgrade({ root, exec: async () => { throw new Error('must not run git') } })
    assert.equal(status.repo, false)
    assert.equal(status.canPull, false)
    assert.equal(status.version, '2.7.0')
    await assert.rejects(
      applyUpgrade({ root }),
      (error) => error instanceof UpgradeError && error.status === 400,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an unreachable remote is reported instead of pretending to be current', async () => {
  const root = await checkout()
  try {
    const exec = fakeGit([
      [(a) => a.join(' ') === 'rev-parse --abbrev-ref HEAD', 'main'],
      [(a) => a[0] === 'log' && a.at(-1) === 'HEAD', describeOf('1111111aaaa', 'head')],
      [(a) => a[0] === 'status', ''],
      [(a) => a[0] === 'fetch', Object.assign(new Error('fetch failed'), { stderr: 'fatal: could not read from remote' })],
    ])
    const status = await checkUpgrade({ root, exec })
    assert.equal(status.canPull, false)
    assert.match(status.fetchError, /could not read from remote/)
    assert.match(status.message, /无法访问远程仓库/)
    await assert.rejects(
      applyUpgrade({ root, exec }),
      (error) => error instanceof UpgradeError && error.code === 'fetch-failed',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
