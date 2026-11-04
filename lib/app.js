/**
 * Android companion app distribution routes.
 *
 * The native app cannot reach a private Git host, so the Host itself publishes
 * the update manifest and the APK over the same authenticated connection the
 * app already uses. Both routes sit behind `ctx.connection.fetch`, so a device
 * only downloads an update with the cookie its pairing minted.
 * @module dsh-im-omni/lib/app
 */
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Update manifest route consumed by the app. */
export const VERSION_PATH = '/api/im-omni.app.version'
/** APK download route referenced by the manifest. */
export const APK_PATH = '/api/im-omni.app.apk'

/** Package root, used to resolve the bundled Android artifacts. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Directory the Android build publishes into. */
const DIST = path.join(ROOT, 'android', 'dist')

/** MIME type Android installers expect. */
const APK_TYPE = 'application/vnd.android.package-archive'

/**
 * Read and validate the published update manifest.
 * @param {string} [dir] - artifact directory; defaults to the bundled build output.
 * @returns {Promise<Record<string, any>|null>} manifest, or null when the app was never built.
 */
async function readManifest(dir = DIST) {
  let raw
  try {
    raw = await readFile(path.join(dir, 'latest.json'), 'utf8')
  } catch {
    return null
  }
  let value
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  const versionCode = Number(value?.versionCode)
  const versionName = typeof value?.versionName === 'string' ? value.versionName.trim() : ''
  const file = typeof value?.file === 'string' ? value.file : ''
  if (!Number.isInteger(versionCode) || versionCode <= 0 || versionName === '' || file === '') return null
  if (file.includes('/') || file.includes('\\') || file.includes('..')) return null
  return {
    versionCode,
    versionName,
    file,
    notes: typeof value.notes === 'string' ? value.notes : '',
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : null,
    minSdk: Number.isInteger(Number(value.minSdk)) ? Number(value.minSdk) : 26,
  }
}

/**
 * SHA-256 digest of a file, or of nothing when the file is missing.
 * @param {string} file - absolute path.
 * @returns {Promise<{sha256:string,size:number}|null>} digest and size.
 */
async function digest(file) {
  let buffer
  try {
    buffer = await readFile(file)
  } catch {
    return null
  }
  return { sha256: createHash('sha256').update(buffer).digest('hex'), size: buffer.length }
}

/**
 * JSON response with no-store caching.
 * @param {Record<string, any>} body - payload.
 * @param {number} status - status code.
 * @returns {Response} response.
 */
function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

/**
 * Serve the update manifest the app polls on launch.
 * @param {{dist?:string}} [options] - artifact directory override.
 * @returns {Promise<Response>} manifest, or a 404 naming the missing artifact.
 */
export async function versionResponse(options = {}) {
  const dir = options.dist ?? DIST
  const manifest = await readManifest(dir)
  if (manifest === null) {
    return json({
      ok: false,
      error: {
        code: 'app-not-published',
        message: 'The Android build has not published android/dist/latest.json yet.',
      },
    }, 404)
  }
  const info = await digest(path.join(dir, manifest.file))
  if (info === null) {
    return json({
      ok: false,
      error: {
        code: 'apk-missing',
        message: `Manifest names ${manifest.file}, which is not in android/dist.`,
      },
    }, 404)
  }
  return json({
    ok: true,
    app: {
      versionCode: manifest.versionCode,
      versionName: manifest.versionName,
      minSdk: manifest.minSdk,
      notes: manifest.notes,
      publishedAt: manifest.publishedAt,
      sha256: info.sha256,
      size: info.size,
      apkPath: APK_PATH,
    },
  })
}

/**
 * Stream the published APK to an authenticated device.
 * @param {Request} request - GET or HEAD request.
 * @param {{dist?:string}} [options] - artifact directory override.
 * @returns {Promise<Response>} APK bytes, or a 404 naming the missing artifact.
 */
export async function apkResponse(request, options = {}) {
  const dir = options.dist ?? DIST
  const manifest = await readManifest(dir)
  if (manifest === null) return json({ ok: false, error: { code: 'app-not-published', message: 'No Android build is published.' } }, 404)
  const file = path.join(dir, manifest.file)
  let info
  try {
    info = await stat(file)
  } catch {
    return json({ ok: false, error: { code: 'apk-missing', message: `${manifest.file} is missing.` } }, 404)
  }
  const headers = {
    'cache-control': 'no-store',
    'content-type': APK_TYPE,
    'content-length': String(info.size),
    'content-disposition': `attachment; filename="dsh-im-omni-${manifest.versionName}.apk"`,
    'x-app-version-code': String(manifest.versionCode),
    'x-app-version-name': manifest.versionName,
  }
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
  return new Response(await readFile(file), { status: 200, headers })
}

/**
 * Directory the published artifacts live in, for diagnostics.
 * @returns {string} absolute path.
 */
export function distDir() {
  return DIST
}
