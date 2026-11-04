/**
 * Password hashing, access tokens and opaque secrets.
 *
 * Access tokens are HS256 JWTs built with `node:crypto` (no JWT dependency);
 * refresh tokens and one-time codes are random strings stored only as SHA-256
 * hashes, so a database leak cannot be replayed.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import argon2 from 'argon2'

/** Signing key; a development default keeps `node --test` frictionless. */
const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me'
/** Access token lifetime in seconds. */
export const ACCESS_TTL = Number(process.env.JWT_TTL ?? 900)

/**
 * Hash a password with argon2id.
 * @param {string} password - plain text.
 * @returns {Promise<string>} encoded hash.
 */
export function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id })
}

/**
 * Verify a password against a stored hash.
 * @param {string} hash - stored hash.
 * @param {string} password - candidate.
 * @returns {Promise<boolean>} whether it matches.
 */
export async function verifyPassword(hash, password) {
  if (typeof hash !== 'string' || hash === '') return false
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}

/** Base64url encode a buffer. */
function b64url(input) {
  return Buffer.from(input).toString('base64url')
}

/**
 * Sign an access token.
 * @param {{userId: string, tenantId: string, role: string, deviceId?: string|null}} claims - token claims.
 * @param {number} [ttlSeconds] - lifetime.
 * @returns {string} compact JWT.
 */
export function signAccess(claims, ttlSeconds = ACCESS_TTL) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(JSON.stringify({
    sub: claims.userId,
    tid: claims.tenantId,
    rol: claims.role,
    did: claims.deviceId ?? null,
    iat: now,
    exp: now + ttlSeconds,
  }))
  const signature = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

/**
 * Verify and decode an access token.
 * @param {string} token - compact JWT.
 * @returns {{userId: string, tenantId: string, role: string, deviceId: string|null}|null} claims.
 */
export function verifyAccess(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof body.exp !== 'number' || body.exp * 1000 < Date.now()) return null
    return {
      userId: String(body.sub ?? ''),
      tenantId: String(body.tid ?? ''),
      role: String(body.rol ?? ''),
      deviceId: body.did == null ? null : String(body.did),
    }
  } catch {
    return null
  }
}

/** Random opaque token (refresh token, device token, invite code). */
export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

/**
 * Short, human-typeable code used for device linking.
 * @returns {string} eight characters, Crockford-ish alphabet (no O/0/I/1).
 */
export function shortCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
}

/**
 * SHA-256 hex digest, used for stored token hashes.
 * @param {string} value - raw secret.
 * @returns {string} hex digest.
 */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
