/**
 * WeCom (企业微信) self-built app adapter.
 * @module dsh-im-omni/lib/channels/wecom
 */
import { text } from '../util.js'
import { header, inboundPayload, mediaPlaceholder, query } from './common.js'
import { requestJson } from './http.js'
import { decryptWecom, verifyWecomSignature } from './crypto.js'
import { parseXml, xmlText } from './xml.js'

/** Cached access tokens. */
const tokens = new Map()

/**
 * Fetch and cache an app access token.
 * @param {Record<string, any>} config - channel config.
 * @param {boolean} [force=false] - bypass cache.
 * @returns {Promise<{ok:boolean,token:string,error:string,expiresIn:number}>} token result.
 */
async function accessToken(config, force = false) {
  const corpId = text(config.corpId, 200)
  const secret = text(config.secret, 1000)
  const key = `${corpId}:${secret}`
  const cached = tokens.get(key)
  if (!force && cached !== undefined && cached.expiresAt > Date.now()) {
    return { ok: true, token: cached.token, error: '', expiresIn: Math.floor((cached.expiresAt - Date.now()) / 1000) }
  }
  const result = await requestJson(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`)
  if (!result.ok) return { ok: false, token: '', error: result.error, expiresIn: 0 }
  if (result.data?.errcode !== 0 && result.data?.errcode !== undefined) {
    return { ok: false, token: '', error: text(result.data?.errmsg, 300) || 'gettoken failed', expiresIn: 0 }
  }
  const token = text(result.data?.access_token, 2000)
  if (token === '') return { ok: false, token: '', error: 'WeCom returned no access_token.', expiresIn: 0 }
  const expiresIn = Math.max(60, Number(result.data?.expires_in) || 7200)
  tokens.set(key, { token, expiresAt: Date.now() + (expiresIn - 120) * 1000 })
  return { ok: true, token, error: '', expiresIn }
}

/**
 * Verify a WeCom callback signature and decrypt one envelope.
 * @param {Record<string, any>} channel - channel.
 * @param {URL} url - request URL.
 * @param {string} encrypted - base64 Encrypt.
 * @returns {{ok:boolean,message:string,error:string}} result.
 */
function openEnvelope(channel, url, encrypted) {
  const config = channel.config ?? {}
  const token = text(config.callbackToken, 500)
  const aesKey = text(config.encodingAESKey, 100)
  const signature = query(url, 'msg_signature')
  const timestamp = query(url, 'timestamp')
  const nonce = query(url, 'nonce')
  if (!verifyWecomSignature(token, timestamp, nonce, encrypted, signature)) {
    return { ok: false, message: '', error: 'invalid msg_signature' }
  }
  try {
    return { ok: true, message: decryptWecom(aesKey, encrypted, text(config.corpId, 200)), error: '' }
  } catch (error) {
    return { ok: false, message: '', error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Handle URL verification and encrypted message callbacks.
 * @param {Record<string, any>} channel - channel.
 * @param {{method:string,url:URL,headers:import('node:http').IncomingHttpHeaders,rawBody:string}} request - request.
 * @returns {Promise<Record<string, any>>} adapter response.
 */
export async function handleWebhook(channel, request) {
  if (request.method === 'GET') {
    const encrypted = query(request.url, 'echostr')
    if (encrypted === '') return { status: 400, body: 'missing echostr' }
    const opened = openEnvelope(channel, request.url, encrypted)
    if (!opened.ok) return { status: 401, body: opened.error }
    return { status: 200, body: opened.message, headers: { 'content-type': 'text/plain; charset=utf-8' } }
  }
  if (request.method !== 'POST') return { status: 405, body: 'method not allowed' }
  let outer
  try {
    outer = parseXml(request.rawBody)
  } catch (error) {
    return { status: 400, body: error instanceof Error ? error.message : 'invalid XML' }
  }
  const opened = openEnvelope(channel, request.url, xmlText(outer, 'Encrypt'))
  if (!opened.ok) return { status: 401, body: opened.error }
  let message
  try {
    message = parseXml(opened.message)
  } catch {
    return { status: 400, body: 'invalid decrypted XML' }
  }
  const type = xmlText(message, 'MsgType')
  if (type !== 'text' && type !== 'image' && type !== 'voice' && type !== 'video' && type !== 'file' && type !== 'location' && type !== 'link') {
    return { status: 200, body: 'success', headers: { 'content-type': 'text/plain; charset=utf-8' }, events: [] }
  }
  const from = xmlText(message, 'FromUserName')
  if (from === '') return { status: 200, body: 'success', headers: { 'content-type': 'text/plain; charset=utf-8' }, events: [] }
  let body = text(xmlText(message, 'Content'), 8000)
  if (body === '') {
    if (type === 'location') {
      body = `[location] ${xmlText(message, 'Label') || `${xmlText(message, 'Location_X')}, ${xmlText(message, 'Location_Y')}`}`.trim()
    } else if (type === 'link') {
      body = `[link] ${xmlText(message, 'Title')} ${xmlText(message, 'Url')}`.trim()
    } else {
      body = mediaPlaceholder(type)
    }
  }
  const event = inboundPayload({
    conversationId: from,
    userId: from,
    messageId: xmlText(message, 'MsgId') || `wecom_${Date.now()}`,
    text: body,
    contactName: '',
    handle: from,
    timestamp: Number(xmlText(message, 'CreateTime')) || Date.now() / 1000,
    attachments: xmlText(message, 'PicUrl') === '' ? [] : [{ name: 'wecom-image', url: xmlText(message, 'PicUrl'), type: 'image/*', size: 0 }],
    replyContext: { agentId: xmlText(message, 'AgentID') || text(channel.config?.agentId, 40), corpId: text(channel.config?.corpId, 200) },
  })
  return {
    status: 200,
    body: 'success',
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    events: [event],
  }
}

/**
 * Send a text application message.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean,error:string,externalId?:string}>} result.
 */
export async function send(channel, conversation, message) {
  const config = channel.config ?? {}
  if (text(config.corpId, 200) === '' || text(config.secret, 1000) === '') return { ok: false, error: 'WeCom corp ID and secret are not configured.' }
  let token = await accessToken(config)
  if (!token.ok) return { ok: false, error: token.error }
  const payload = {
    touser: text(conversation.externalId, 300),
    msgtype: 'text',
    agentid: Number(config.agentId) || 0,
    text: { content: text(message.text, 8000) },
    safe: 0,
    duplicate_check_interval: 1800,
  }
  let result = await requestJson(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token.token)}`, {
    method: 'POST',
    body: payload,
  })
  if (result.ok && (result.data?.errcode === 42001 || result.data?.errcode === 40014)) {
    token = await accessToken(config, true)
    if (token.ok) {
      result = await requestJson(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token.token)}`, {
        method: 'POST',
        body: payload,
      })
    }
  }
  if (!result.ok) return { ok: false, error: result.error }
  if (result.data?.errcode !== 0 && result.data?.errcode !== undefined) {
    return { ok: false, error: text(result.data?.errmsg, 300) || `WeCom error ${result.data.errcode}` }
  }
  return { ok: true, error: '', externalId: text(result.data?.msgid, 300) }
}

/**
 * Probe gettoken.
 * @param {Record<string, any>} channel - channel.
 * @returns {Promise<{ok:boolean,detail:string,account?:string}>} probe.
 */
export async function test(channel) {
  const config = channel.config ?? {}
  if (text(config.corpId, 200) === '' || text(config.secret, 1000) === '') return { ok: false, detail: 'Corp ID and app secret are required.' }
  const token = await accessToken(config, true)
  return token.ok
    ? { ok: true, detail: `Access token acquired (${token.expiresIn}s), agent ${text(config.agentId, 40) || '—'}.`, account: text(config.corpId, 200) }
    : { ok: false, detail: token.error }
}
