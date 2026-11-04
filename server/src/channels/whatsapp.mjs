/**
 * WhatsApp Cloud API adapter.
 *
 * Outbound: POST {graphBase}/{phoneNumberId}/messages with the channel token.
 * Inbound: Meta posts a nested change payload; `parseWebhook` flattens the first
 * text message into the shape the generic inbound handler understands.
 *
 * `graphBase` is configurable so tests (and private gateways) can point at a
 * local stand-in instead of graph.facebook.com.
 */

/** Default Graph origin. */
export const GRAPH_BASE = 'https://graph.facebook.com/v20.0'

/**
 * Send one text message through the Cloud API.
 * @param {{config?: Record<string, any>, credentials?: string}} channel - channel row.
 * @param {{body: string, contactPhone: string}} message - outbound message.
 * @param {typeof fetch} [fetchImpl] - injectable fetch.
 * @returns {Promise<{ok: boolean, status: number, body: string}>} outcome.
 */
export async function sendWhatsapp(channel, message, fetchImpl = fetch) {
  const config = channel.config ?? {}
  const phoneNumberId = typeof config.phoneNumberId === 'string' ? config.phoneNumberId : ''
  const token = typeof channel.credentials === 'string' ? channel.credentials : ''
  if (phoneNumberId === '' || token === '') {
    return { ok: false, status: 0, body: 'missing phoneNumberId or token' }
  }
  const base = typeof config.graphBaseUrl === 'string' && config.graphBaseUrl !== ''
    ? config.graphBaseUrl
    : GRAPH_BASE
  const payload = {
    messaging_product: 'whatsapp',
    to: message.contactPhone.replace(/[^\d+]/g, ''),
    type: 'text',
    text: { body: message.body },
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetchImpl(`${base.replace(/\/$/, '')}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    return { ok: response.ok, status: response.status, body: await response.text() }
  } catch (error) {
    return { ok: false, status: 0, body: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Flatten a Meta webhook payload into one inbound message.
 * @param {Record<string, any>} payload - raw webhook body.
 * @returns {{phone: string, name: string, text: string, externalId: string} | null} message or null.
 */
export function parseWebhook(payload) {
  const entry = Array.isArray(payload?.entry) ? payload.entry[0] : undefined
  const change = Array.isArray(entry?.changes) ? entry.changes[0] : undefined
  const value = change?.value
  const message = Array.isArray(value?.messages) ? value.messages[0] : undefined
  if (message === undefined) return null
  const text = message.text?.body ?? message.button?.text ?? ''
  if (typeof text !== 'string' || text.trim() === '') return null
  const contact = Array.isArray(value?.contacts) ? value.contacts[0] : undefined
  return {
    phone: String(message.from ?? ''),
    name: String(contact?.profile?.name ?? ''),
    text: text.trim(),
    externalId: String(message.id ?? ''),
  }
}
