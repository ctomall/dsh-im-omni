/**
 * Discord bot REST helpers and message normalization.
 * @module @local/im-omni/lib/channels/discord
 */
import { text } from '../util.js'
import { inboundPayload } from './common.js'
import { requestJson } from './http.js'

/** Discord REST base. */
export const API = 'https://discord.com/api/v10'

/**
 * Bot authorization header.
 * @param {Record<string, any>} channel - channel.
 * @returns {string} header value.
 */
export function botAuth(channel) {
  return `Bot ${text(channel.config?.botToken, 500)}`
}

/**
 * Normalize one MESSAGE_CREATE dispatch.
 * @param {Record<string, any>} message - Discord message.
 * @param {string} [selfId=''] - bot user id.
 * @returns {Record<string, any>|null} payload or null.
 */
export function parseMessage(message, selfId = '') {
  if (message === null || typeof message !== 'object') return null
  const author = message.author ?? {}
  if (author.bot === true || (selfId !== '' && author.id === selfId)) return null
  const channelId = text(message.channel_id, 300)
  const content = text(message.content, 8000)
  if (channelId === '' || content === '') return null
  const name = text(message.member?.nick, 120) || text(author.global_name, 120) || text(author.username, 120)
  return inboundPayload({
    conversationId: channelId,
    userId: text(author.id, 300) || channelId,
    messageId: text(message.id, 300) || `dc_${Date.now()}`,
    text: content,
    contactName: name,
    handle: text(author.username, 120),
    timestamp: text(message.timestamp, 40) || Date.now(),
    attachments: [],
    replyContext: {
      channelId,
      guildId: text(message.guild_id, 300) || null,
    },
  })
}

/**
 * Send text, splitting at Discord's 2000-character limit.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const token = text(channel.config?.botToken, 500)
  if (token === '') return { ok: false, error: 'Discord bot token is not configured.' }
  const channelId = text(conversation.externalId, 300)
  const chunks = []
  let remaining = text(message.text, 8000)
  while (remaining.length > 1900) {
    const cut = remaining.lastIndexOf('\n', 1900)
    const at = cut > 200 ? cut : 1900
    chunks.push(remaining.slice(0, at))
    remaining = remaining.slice(at).replace(/^\n/, '')
  }
  if (remaining !== '') chunks.push(remaining)
  let lastId = ''
  for (const content of chunks) {
    const result = await requestJson(`${API}/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bot ${token}` },
      body: { content, allowed_mentions: { parse: [], replied_user: false } },
    })
    if (!result.ok) return { ok: false, error: result.error }
    lastId = text(result.data?.id, 300) || lastId
  }
  return { ok: true, error: '', externalId: lastId }
}

/**
 * Probe the bot user.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  if (text(channel.config?.botToken, 500) === '') return { ok: false, detail: 'Bot token is required.' }
  const result = await requestJson(`${API}/users/@me`, {
    headers: { authorization: botAuth(channel) },
  })
  if (!result.ok) return { ok: false, detail: result.error }
  const name = text(result.data?.username, 120)
  return { ok: true, detail: `${name || 'bot'}#${text(result.data?.discriminator, 10) || '0'}`, account: name || undefined }
}
