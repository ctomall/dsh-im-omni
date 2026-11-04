/**
 * Signature and encryption helpers for platform callbacks.
 * @module @local/im-omni/lib/channels/crypto
 */
import { createDecipheriv, createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison of two strings.
 * @param {string} left - supplied.
 * @param {string} right - expected.
 * @returns {boolean} equal.
 */
export function sameString(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left === '' || right === '') return false
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * SHA-256 hex digest.
 * @param {string} value - input.
 * @returns {string} hex.
 */
export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * SHA-1 hex digest (WeCom callback signature).
 * @param {string} value - input.
 * @returns {string} hex.
 */
export function sha1Hex(value) {
  return createHash('sha1').update(value).digest('hex')
}

/**
 * HMAC digest.
 * @param {string} secret - key.
 * @param {string|Buffer} body - message.
 * @param {'hex'|'base64'} encoding - output encoding.
 * @returns {string} digest.
 */
export function hmac(secret, body, encoding = 'hex') {
  return createHmac('sha256', secret).update(body).digest(encoding)
}

/**
 * Verify Meta's `sha256=<hex>` X-Hub-Signature-256 header.
 * @param {string} appSecret - Meta app secret.
 * @param {string} rawBody - raw request body.
 * @param {string} signature - header value.
 * @returns {boolean} valid.
 */
export function verifyMetaSignature(appSecret, rawBody, signature) {
  const value = String(signature ?? '')
  if (!value.startsWith('sha256=')) return false
  return sameString(value.slice(7), hmac(appSecret, rawBody, 'hex'))
}

/**
 * Verify Slack's `v0=<hex>` signature.
 * @param {string} signingSecret - Slack signing secret.
 * @param {string} timestamp - X-Slack-Request-Timestamp.
 * @param {string} rawBody - raw body.
 * @param {string} signature - X-Slack-Signature.
 * @returns {boolean} valid.
 */
export function verifySlackSignature(signingSecret, timestamp, rawBody, signature) {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false
  const expected = `v0=${hmac(signingSecret, `v0:${timestamp}:${rawBody}`, 'hex')}`
  return sameString(signature, expected)
}

/**
 * Verify Feishu's X-Lark-Signature over raw encrypted body.
 * @param {string} encryptKey - Encrypt Key.
 * @param {string} timestamp - header.
 * @param {string} nonce - header.
 * @param {string} rawBody - raw body.
 * @param {string} signature - header.
 * @returns {boolean} valid.
 */
export function verifyFeishuSignature(encryptKey, timestamp, nonce, rawBody, signature) {
  return sameString(sha256Hex(`${timestamp}${nonce}${encryptKey}${rawBody}`), signature)
}

/**
 * Decrypt a Feishu AES-256-CBC payload.
 * @param {string} encryptKey - Encrypt Key.
 * @param {string} encrypted - base64 ciphertext prefixed with the 16-byte IV.
 * @returns {string} plaintext JSON.
 */
export function decryptFeishu(encryptKey, encrypted) {
  const buffer = Buffer.from(String(encrypted), 'base64')
  if (buffer.length <= 16 || (buffer.length - 16) % 16 !== 0) throw new Error('Invalid Feishu ciphertext length.')
  const key = createHash('sha256').update(encryptKey).digest()
  const decipher = createDecipheriv('aes-256-cbc', key, buffer.subarray(0, 16))
  return Buffer.concat([decipher.update(buffer.subarray(16)), decipher.final()]).toString('utf8')
}

/**
 * WeCom AES key from EncodingAESKey.
 * @param {string} encodingAESKey - 43-character key.
 * @returns {Buffer} 32-byte key.
 */
export function wecomKey(encodingAESKey) {
  const decoded = Buffer.from(`${encodingAESKey}=`, 'base64')
  if (decoded.length !== 32) throw new Error('EncodingAESKey must decode to 32 bytes.')
  return decoded
}

/**
 * Verify WeCom's msg_signature = sha1(sort(token, timestamp, nonce, encrypt)).
 * @param {string} token - callback token.
 * @param {string} timestamp - query/body timestamp.
 * @param {string} nonce - query/body nonce.
 * @param {string} encrypted - encrypted payload.
 * @param {string} signature - msg_signature.
 * @returns {boolean} valid.
 */
export function verifyWecomSignature(token, timestamp, nonce, encrypted, signature) {
  const expected = sha1Hex([token, timestamp, nonce, encrypted].sort().join(''))
  return sameString(signature, expected)
}

/**
 * Decrypt WeCom's AES-256-CBC message envelope.
 * @param {string} encodingAESKey - 43-character key.
 * @param {string} encrypted - base64 ciphertext.
 * @param {string} expectedCorpId - Corp ID bound into the plaintext.
 * @returns {string} decrypted message XML.
 */
export function decryptWecom(encodingAESKey, encrypted, expectedCorpId = '') {
  const key = wecomKey(encodingAESKey)
  const buffer = Buffer.from(encrypted, 'base64')
  if (buffer.length === 0 || buffer.length % 16 !== 0) throw new Error('Invalid WeCom ciphertext length.')
  const decipher = createDecipheriv('aes-256-cbc', key, key.subarray(0, 16))
  decipher.setAutoPadding(false)
  const plain = Buffer.concat([decipher.update(buffer), decipher.final()])
  const pad = plain[plain.length - 1]
  if (pad < 1 || pad > 32) throw new Error('Invalid WeCom padding.')
  const unpadded = plain.subarray(0, plain.length - pad)
  if (unpadded.length < 20) throw new Error('WeCom plaintext is too short.')
  const length = unpadded.readUInt32BE(16)
  if (20 + length > unpadded.length) throw new Error('WeCom message length is invalid.')
  const message = unpadded.subarray(20, 20 + length).toString('utf8')
  const receiveId = unpadded.subarray(20 + length).toString('utf8')
  if (expectedCorpId !== '' && receiveId !== expectedCorpId) throw new Error('WeCom receive id does not match the configured Corp ID.')
  return message
}

/**
 * Verify DingTalk robot callback signature.
 * @param {string} secret - robot sign secret.
 * @param {string} timestamp - header timestamp in milliseconds.
 * @param {string} sign - header sign, possibly URL encoded.
 * @returns {boolean} valid.
 */
export function verifyDingtalkSignature(secret, timestamp, sign) {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(Date.now() - seconds) > 3_600_000) return false
  const expected = hmac(secret, `${timestamp}\n${secret}`, 'base64')
  let supplied = String(sign ?? '')
  try {
    supplied = decodeURIComponent(supplied)
  } catch {
    // Keep the raw value for comparison.
  }
  return sameString(supplied, expected)
}
