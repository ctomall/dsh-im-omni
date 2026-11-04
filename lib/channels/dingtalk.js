/**
 * DingTalk robot adapter.
 * @module dsh-im-omni/lib/channels/dingtalk
 */
import { text } from '../util.js'
import { header, inboundPayload, mediaPlaceholder, pickObject } from './common.js'
import { httpUrl, requestJson } from './http.js'
import { verifyDingtalkSignature } from './crypto.js'

/** Cached app access tokens. */
const tokens = new Map()

/**
 * Fetch an app access token.
 * @param {Record<string, any>} config - channel config.
 * @param {boolean} [force=false] - bypass cache.
 * @returns {Promise<{ok:boolean,token:string,error:string}>} token result.
 */
async function appToken(config, force = false) {
  const appKey = text(config.appKey, 300)
  const appSecret = text(config.appSecret, 1000)
  if (appKey === '' || appSecret === '') return { ok: false, token: '', error: 'DingTalk app credentials are not configured.' }
  const key = `${appKey}:${appSecret}`
  const cached = tokens.get(key)
  if (!force && cached !== undefined && cached.expiresAt > Date.now()) return { ok: true, token: cached.token, error: '' }
  const result = await requestJson('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
    method: 'POST',
    body: { appKey, appSecret },
  })
  if (!result.ok) return { ok: false, token: '', error: result.error }
  const token = text(result.data?.accessToken, 3000)
  if (token === '') return { ok: false, token: '', error: 'DingTalk returned no accessToken.' }
  tokens.set(key, { token, expiresAt: Date.now() + (Number(result.data?.expireIn) || 7200) * 1000 - 120_000 })
  return { ok: true, token, error: '' }
}

/**
 * Handle a DingTalk outgoing-robot callback.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  const config = channel.config ?? {}
  const secret = text(config.signSecret, 500)
  if (secret !== '' && !verifyDingtalkSignature(secret, header(request.headers, 'timestamp'), header(request.headers, 'sign'))) {
    return { status: 401, body: 'invalid signature' }
  }
  let body
  try {
    body = JSON.parse(request.rawBody)
  } catch {
    return { status: 400, body: 'invalid JSON' }
  }
  const senderStaffId = text(body?.senderStaffId ?? body?.senderId, 300)
  const conversationId = text(body?.conversationId, 300) || senderStaffId
  if (conversationId === '') return { status: 200, body: { ok: true }, events: [] }
  const type = text(body?.msgtype, 40)
  let content = ''
  if (type === 'text') content = text(body?.text?.content, 8000)
  else if (type === 'richText') {
    const parts = []
    for (const block of Array.isArray(body?.richText?.content) ? body.richText.content : []) {
      if (typeof block?.text === 'string') parts.push(block.text)
    }
    content = text(parts.join(''), 8000) || mediaPlaceholder('richText')
  } else content = mediaPlaceholder(type)
  const webhook = text(body?.sessionWebhook, 2000)
  const expires = Number(body?.sessionWebhookExpiredTime) || 0
  return {
    status: 200,
    body: { ok: true },
    events: [inboundPayload({
      conversationId,
      userId: senderStaffId || conversationId,
      messageId: text(body?.msgId, 300) || `dt_${Date.now()}`,
      text: content,
      contactName: text(body?.senderNick, 120),
      handle: senderStaffId,
      timestamp: Number(body?.createAt) || Date.now(),
      attachments: [],
      replyContext: webhook === '' ? null : { sessionWebhook: webhook, expiresAt: expires, robotCode: text(body?.robotCode ?? config.robotCode, 200) },
    })],
  }
}

/**
 * Send through the app robot API, falling back to the 1.5h session webhook.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const config = channel.config ?? {}
  const robotCode = text(config.robotCode, 300) || text(config.appKey, 300)
  const content = text(message.text, 8000)
  if (robotCode !== '' && text(config.appKey, 300) !== '' && text(config.appSecret, 1000) !== '') {
    const token = await appToken(config)
    if (!token.ok) return { ok: false, error: token.error }
    const to = text(conversation.externalId, 300)
    const group = text(config.conversationType, 20) !== 'single' && /^cid/.test(to)
    const url = group
      ? 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'
      : 'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend'
    const body = group
      ? { robotCode, openConversationId: to, msgKey: 'sampleText', msgParam: JSON.stringify({ content }) }
      : { robotCode, userIds: [to], msgKey: 'sampleText', msgParam: JSON.stringify({ content }) }
    const result = await requestJson(url, {
      method: 'POST',
      headers: { 'x-acs-dingtalk-access-token': token.token },
      body,
    })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true, error: '', externalId: text(result.data?.processQueryKey, 300) }
  }
  const webhook = text(conversation.replyContext?.sessionWebhook, 2000)
  const expiresAt = Number(conversation.replyContext?.expiresAt) || 0
  if (webhook === '') return { ok: false, error: 'DingTalk app credentials are missing and no session webhook is available.' }
  if (expiresAt > 0 && expiresAt < Date.now()) return { ok: false, error: 'The DingTalk session webhook has expired. Add app credentials for proactive sends.' }
  let url
  try {
    url = httpUrl(webhook, 'DingTalk session webhook')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (!/(^|\.)dingtalk\.com$/i.test(url.hostname)) return { ok: false, error: 'Unexpected DingTalk session webhook host.' }
  const result = await requestJson(url.toString(), {
    method: 'POST',
    body: { msgtype: 'text', text: { content } },
  })
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, error: '' }
}

/**
 * Probe app credentials when configured; otherwise confirm the webhook mode.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  const config = channel.config ?? {}
  if (text(config.appKey, 300) !== '' || text(config.appSecret, 1000) !== '') {
    const token = await appToken(config, true)
    return token.ok
      ? { ok: true, detail: 'App accessToken acquired; proactive sends are enabled.', account: text(config.robotCode ?? config.appKey, 200) }
      : { ok: false, detail: token.error }
  }
  return { ok: true, detail: 'Webhook-only mode: verify the callback and send within the sessionWebhook window.', account: undefined }
}
