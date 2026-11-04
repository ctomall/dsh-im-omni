/**
 * One-click self-upgrade for a plugin installed from its Git checkout.
 *
 * The Host runs `git` against the package directory only: the request never
 * carries a path, the only commands are `fetch`, `rev-list`, `status` and
 * `pull --ff-only`, and a dirty working tree is always refused. A successful
 * pull cannot hot-swap loaded JavaScript, so the result says explicitly that
 * the plugin must be reloaded before the new code runs.
 * @module dsh-im-omni/lib/upgrade
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

/** Package root; `git` always runs here. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Hard ceiling for one git invocation. */
const GIT_TIMEOUT_MS = 25_000

/** Hard ceiling for captured git output. */
const MAX_BUFFER = 1_000_000

const execFileAsync = promisify(execFile)

/**
 * A git failure carrying the plugin's error shape.
 */
export class UpgradeError extends Error {
  /**
   * @param {string} code - stable error code.
   * @param {string} message - human message.
   * @param {number} [status] - HTTP status.
   */
  constructor(code, message, status = 409) {
    super(message)
    this.name = 'UpgradeError'
    this.code = code
    this.status = status
  }
}

/**
 * Run one git command inside the package checkout.
 * @param {string[]} args - argument list, never a shell string.
 * @param {{root?:string, exec?:Function}} [options] - overrides for tests.
 * @returns {Promise<{stdout:string,stderr:string}>} captured output.
 */
async function git(args, options = {}) {
  const root = options.root ?? ROOT
  const exec = options.exec ?? execFileAsync
  try {
    const result = await exec('git', args, {
      cwd: root,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: {
        ...process.env,
        // Never let git wait on a credential prompt: this runs inside the Host.
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '',
        LC_ALL: 'C',
      },
    })
    return { stdout: String(result.stdout ?? '').trim(), stderr: String(result.stderr ?? '').trim() }
  } catch (error) {
    const stderr = String(error?.stderr ?? '').trim()
    const message = stderr || String(error?.message ?? 'git failed')
    throw new UpgradeError('git-failed', message.slice(0, 500))
  }
}

/**
 * Read one commit's short hash, subject and date.
 * @param {string} revision - revision to describe.
 * @param {{root?:string, exec?:Function}} [options] - overrides for tests.
 * @returns {Promise<{sha:string,short:string,subject:string,date:string}|null>} commit, or null.
 */
async function describe(revision, options) {
  try {
    const { stdout } = await git(['log', '-1', '--format=%H%x00%h%x00%s%x00%cI', revision], options)
    const [sha, short, subject, date] = stdout.split('\u0000')
    if (!sha) return null
    return { sha, short, subject, date }
  } catch {
    return null
  }
}

/**
 * Whether this package directory is a Git checkout at all.
 * @param {{root?:string}} [options] - overrides for tests.
 * @returns {Promise<boolean>} true when `.git` exists.
 */
export async function isCheckout(options = {}) {
  const root = options.root ?? ROOT
  try {
    await readFile(path.join(root, '.git', 'HEAD'), 'utf8')
    return true
  } catch {
    return false
  }
}

/**
 * The plugin's own version, read from its manifest.
 * @param {{root?:string}} [options] - overrides for tests.
 * @returns {Promise<string>} version, or an empty string.
 */
export async function packageVersion(options = {}) {
  const root = options.root ?? ROOT
  try {
    const raw = await readFile(path.join(root, 'package.json'), 'utf8')
    return typeof JSON.parse(raw)?.version === 'string' ? JSON.parse(raw).version : ''
  } catch {
    return ''
  }
}

/**
 * Compare the checkout with its upstream branch.
 * @param {{root?:string, exec?:Function, fetch?:boolean}} [options] - overrides for tests.
 * @returns {Promise<Record<string, any>>} status document.
 */
export async function checkUpgrade(options = {}) {
  const version = await packageVersion(options)
  if (!(await isCheckout(options))) {
    return {
      installKind: 'package',
      version,
      repo: false,
      canPull: false,
      message: '这个插件不是从 Git 目录安装的，无法自更新。',
    }
  }

  const { stdout: branchOut } = await git(['rev-parse', '--abbrev-ref', 'HEAD'], options)
  const branch = branchOut || 'HEAD'
  const current = await describe('HEAD', options)
  if (current === null) throw new UpgradeError('git-failed', '无法读取当前提交。')

  const dirtyOutput = await git(['status', '--porcelain'], options)
  const dirtyFiles = dirtyOutput.stdout.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20)

  let remote = null
  let behind = 0
  let ahead = 0
  let commits = []
  let fetchError = ''

  if (options.fetch !== false) {
    try {
      await git(['fetch', '--quiet', '--prune', 'origin'], options)
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error)
    }
  }

  const upstream = await resolveUpstream(branch, options)
  if (upstream !== null && fetchError === '') {
    remote = await describe(upstream, options)
    try {
      const { stdout } = await git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`], options)
      const [aheadRaw, behindRaw] = stdout.split(/\s+/)
      ahead = Number.parseInt(aheadRaw ?? '0', 10) || 0
      behind = Number.parseInt(behindRaw ?? '0', 10) || 0
    } catch {
      behind = 0
      ahead = 0
    }
    if (behind > 0) {
      try {
        const { stdout } = await git(['log', '--format=%h %s', `HEAD..${upstream}`], options)
        commits = stdout.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 20)
      } catch {
        commits = []
      }
    }
  }

  const canPull = behind > 0 && dirtyFiles.length === 0 && fetchError === ''
  let message
  if (fetchError !== '') message = `无法访问远程仓库：${fetchError}`
  else if (upstream === null) message = `当前分支 ${branch} 没有跟踪远程分支。`
  else if (dirtyFiles.length > 0 && behind > 0) message = '工作区有未提交改动，先清理后再更新。'
  else if (behind > 0) message = `落后远程 ${behind} 个提交。`
  else if (ahead > 0) message = `本地领先远程 ${ahead} 个提交。`
  else message = '已是最新版本。'

  return {
    installKind: 'git',
    version,
    repo: true,
    root: options.root ?? ROOT,
    branch,
    upstream,
    current,
    remote,
    behind,
    ahead,
    dirtyFiles,
    commits,
    canPull,
    fetchError,
    message,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Resolve the remote branch HEAD tracks, falling back to `origin/<branch>`.
 * @param {string} branch - current branch.
 * @param {{root?:string, exec?:Function}} [options] - overrides for tests.
 * @returns {Promise<string|null>} upstream ref name.
 */
async function resolveUpstream(branch, options) {
  if (branch !== 'HEAD') {
    try {
      const { stdout } = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], options)
      if (stdout) return stdout
    } catch {
      // No configured upstream: try the conventional name below.
    }
    try {
      await git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], options)
      return `origin/${branch}`
    } catch {
      return null
    }
  }
  return null
}

/**
 * Fast-forward the checkout to its upstream branch.
 * @param {{root?:string, exec?:Function}} [options] - overrides for tests.
 * @returns {Promise<Record<string, any>>} post-upgrade status plus what changed.
 */
export async function applyUpgrade(options = {}) {
  const before = await checkUpgrade(options)
  if (before.repo !== true) throw new UpgradeError('not-a-checkout', '这个插件不是从 Git 目录安装的，无法自更新。', 400)
  if (before.fetchError) throw new UpgradeError('fetch-failed', before.fetchError)
  if (before.dirtyFiles.length > 0) {
    throw new UpgradeError('dirty-worktree', '工作区有未提交改动，为避免覆盖，已停止更新。', 409)
  }
  if (before.behind === 0) {
    return { changed: false, status: before, message: '已是最新版本，无需更新。', restartRequired: false }
  }

  const { stdout: pullOut, stderr: pullErr } = await git(['pull', '--ff-only', '--no-rebase', 'origin', before.branch], options)
  const after = await checkUpgrade({ ...options, fetch: false })

  let changedFiles = []
  try {
    const { stdout } = await git(
      ['diff', '--name-only', before.current.sha, after.current.sha],
      options,
    )
    changedFiles = stdout.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 50)
  } catch {
    changedFiles = []
  }

  return {
    changed: after.current.sha !== before.current.sha,
    before: before.current,
    after: after.current,
    commits: before.commits,
    changedFiles,
    packageChanged: changedFiles.includes('package.json') || changedFiles.includes('pnpm-lock.yaml'),
    hostChanged: changedFiles.some((file) => file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.yml')),
    clientChanged: changedFiles.includes('client.js'),
    restartRequired: after.current.sha !== before.current.sha,
    status: after,
    output: [pullOut, pullErr].filter(Boolean).join('\n').slice(0, 800),
    message: after.current.sha !== before.current.sha
      ? `已更新到 ${after.current.short}。需要重载插件（或重启 DSH）后新代码才会生效${changedFiles.includes('client.js') ? '，浏览器端还需硬刷新' : ''}。`
      : '拉取完成，但提交没有变化。',
  }
}

/**
 * Directory the updater operates on, for diagnostics.
 * @returns {string} absolute package root.
 */
export function checkoutRoot() {
  return ROOT
}
