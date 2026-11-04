/**
 * Minimal, dependency-free XML reader for WeCom callbacks.
 *
 * It only supports element names, CDATA, and text content. DTDs and entities
 * beyond the five XML built-ins are rejected so a callback cannot expand
 * external entities.
 * @module dsh-im-omni/lib/channels/xml
 */

/** Named XML entities accepted in text nodes. */
const ENTITIES = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
])

/**
 * Decode built-in entities without evaluating arbitrary markup.
 * @param {string} value - text.
 * @returns {string} decoded text.
 */
function decode(value) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return ENTITIES.get(entity) ?? match
  })
}

/**
 * Read one flat XML document into an object.
 * @param {string} xml - XML text.
 * @returns {Record<string, string|string[]>} flat elements.
 * @throws {Error} for malformed or unsafe input.
 */
export function parseXml(xml) {
  const source = String(xml ?? '').trim()
  if (source === '') return {}
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('DTD and entity declarations are not accepted.')
  const result = {}
  const pattern = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>((?:<!\[CDATA\[[\s\S]*?\]\]>|(?!<[A-Za-z_/!])[\s\S])*?)<\/\1>/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const name = match[1]
    const inner = match[2]
    if (/<[A-Za-z_/]/.test(inner)) continue
    const cdata = inner.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/)
    const value = cdata === null ? decode(inner) : cdata[1]
    if (result[name] === undefined) result[name] = value
    else if (Array.isArray(result[name])) result[name].push(value)
    else result[name] = [result[name], value]
  }
  return result
}

/**
 * Read a scalar element from parsed XML.
 * @param {Record<string, string|string[]>} doc - parsed XML.
 * @param {string} name - element name.
 * @returns {string} value or empty.
 */
export function xmlText(doc, name) {
  const value = doc[name]
  if (Array.isArray(value)) return value[0] ?? ''
  return typeof value === 'string' ? value : ''
}

/**
 * Escape text for XML output.
 * @param {string} value - raw value.
 * @returns {string} escaped value.
 */
export function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[char] ?? char)
}
