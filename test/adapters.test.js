/**
 * Adapter-level tests: crypto, normalization, config validation, and dispatch.
 * Run with: node --test test/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PLATFORMS, platformOf } from '../lib/channels/catalog.js'
import { normalizeConfig, publicChannel, revealSecrets } from '../lib/channels/index.js'
import { handleWebhook as whatsappWebhook } from '../lib/channels/whatsapp-cloud.js'
import { parseUpdate, handleWebhook as telegramWebhook } from '../lib/channels/telegram.js'
import { handleWebhook as feishuWebhook } from '../lib/channels/feishu.js'
import { handleWebhook as wecomWebhook } from '../lib/channels/wecom.js'
import { handleWebhook as slackWebhook } from '../lib/channels/slack.js'
import { handleWebhook as lineWebhook } from '../lib/channels/line.js'
import { handleWebhook as dingtalkWebhook } from '../lib/channels/dingtalk.js'
import { parseMessage } from '../lib/channels/discord.js'
import { handleWebhook as qrWebhook, status as qrStatus } from '../lib/channels/qr-bridge.js'
import { hmac, sha256Hex } from '../lib/channels/crypto.js'
import { Store, publicState } from '../lib/store.js'

/** Build a WeCom AES envelope accepted by the adapter. */
function encryptWecom(encodingAESKey, message, corpId) {
  const key = Buffer.from(`${encodingAESKey}=`, 'base64')
  const random = randomBytes(16)
  const body = Buffer.from(message)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length, 0)
  const raw = Buffer.concat([random, length, body, Buffer.from(corpId)])
  const pad = 32 - (raw.length % 32)
  const plain = Buffer.concat([raw, Buffer.alloc(pad, pad)])
  const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString('base64')
}

/** Build a Feishu AES envelope accepted by the adapter. */
function encryptFeishu(encryptKey, value) {
  const key = createHash('sha256').update(encryptKey).digest()
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, encrypted]).toString('base64')
}

/** Build one WeCom callback URL with a valid signature. */
function wecomUrl(token, encrypted) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const nonce = 'nonce'
  const signature = createHash('sha1').update([token, timestamp, nonce, encrypted].sort().join('')).digest('hex')
  return new URL(`http://localhost/api/im-omni.webhook/x?msg_signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(encrypted)}`)
}

test('catalog exposes every requested provider plus custom HTTP', () => {
  const ids = PLATFORMS.map((platform) => platform.id)
  for (const id of ['whatsapp_cloud', 'whatsapp_qr', 'wechat_qr', 'wecom', 'telegram', 'feishu', 'slack', 'discord', 'line', 'dingtalk', 'webhook']) {
    assert.ok(ids.includes(id), `missing ${id}`)
  }
  assert.equal(platformOf('wecom').official, true)
  assert.equal(platformOf('whatsapp_qr').capabilities.includes('qr'), true)
})

test('normalizeConfig generates automatic secrets and rejects missing required fields', () => {
  const config = normalizeConfig('whatsapp_cloud', {
    phoneNumberId: '123',
    accessToken: 'token',
    appSecret: 'secret',
  })
  assert.equal(config.phoneNumberId, '123')
  assert.ok(config.verifyToken.length >= 32)
  assert.equal(config.graphVersion, '')

  assert.throws(() => normalizeConfig('telegram', {}), /botToken is required/)

  const bridge = normalizeConfig('whatsapp_qr', { bridgeUrl: 'http://127.0.0.1:8790' })
  assert.ok(bridge.bridgeToken.length >= 32)
  assert.equal(bridge.sessionName, '')
  assert.equal(bridge.mode, 'embedded')

  const external = normalizeConfig('whatsapp_qr', { mode: 'bridge', bridgeUrl: 'http://127.0.0.1:8790' })
  assert.equal(external.mode, 'bridge')
  assert.throws(() => normalizeConfig('whatsapp_qr', { mode: 'bridge' }), /bridgeUrl is required/)

  // Demo channels keep their local demo:// outbound URL; editing one must not fail.
  const demo = normalizeConfig('webhook', { outboundUrl: 'demo://website' })
  assert.equal(demo.outboundUrl, 'demo://website')
})

test('publicChannel redacts provider secrets but reports configured flags', () => {
  const channel = {
    id: 'chn_test',
    type: 'telegram',
    name: 'Telegram',
    config: { botToken: '123:secret', mode: 'polling' },
    secret: 'internal',
    runtime: { health: 'ready' },
  }
  const view = publicChannel(channel)
  assert.equal(view.config.botToken, '••••••••')
  assert.equal(view.config.mode, 'polling')
  assert.equal(view.configuredSecrets.botToken, true)
  assert.equal(view.secret, undefined)
  assert.deepEqual(revealSecrets(channel), { botToken: '123:secret' })
})

test('WhatsApp Cloud verifies challenge and signed inbound messages', async () => {
  const channel = { id: 'chn_wa', type: 'whatsapp_cloud', config: { appSecret: 'app-secret', verifyToken: 'verify-me', graphVersion: 'v23.0' } }
  const challenge = await whatsappWebhook(channel, {
    method: 'GET',
    url: new URL('http://localhost/api/im-omni.webhook/chn_wa?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42'),
    headers: {},
    rawBody: '',
  })
  assert.equal(challenge.status, 200)
  assert.equal(challenge.body, '42')

  const rawBody = JSON.stringify({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '123' },
          contacts: [{ profile: { name: 'Lin Yue' }, wa_id: '8613800000000' }],
          messages: [{
            from: '8613800000000',
            id: 'wamid.1',
            timestamp: '1788000000',
            type: 'text',
            text: { body: 'Hello' },
          }],
        },
      }],
    }],
  })
  const response = await whatsappWebhook(channel, {
    method: 'POST',
    url: new URL('http://localhost/api/im-omni.webhook/chn_wa'),
    headers: { 'x-hub-signature-256': `sha256=${hmac('app-secret', rawBody)}` },
    rawBody,
  })
  assert.equal(response.status, 200)
  assert.equal(response.events.length, 1)
  assert.equal(response.events[0].message.text, 'Hello')
  assert.equal(response.events[0].contact.name, 'Lin Yue')
  assert.equal(response.events[0].externalConversationId, '8613800000000')
})

test('Telegram webhook verifies secret token and normalizes message', async () => {
  const update = {
    update_id: 1,
    message: {
      message_id: 7,
      date: 1788000000,
      text: 'Hi',
      chat: { id: 1001, type: 'private' },
      from: { id: 1001, first_name: 'Mia', username: 'mia' },
    },
  }
  const channel = { type: 'telegram', config: { secretToken: 'tg-secret' } }
  const denied = await telegramWebhook(channel, {
    method: 'POST',
    url: new URL('http://localhost/api/im-omni.webhook/x'),
    headers: {},
    rawBody: JSON.stringify(update),
  })
  assert.equal(denied.status, 401)
  const allowed = await telegramWebhook(channel, {
    method: 'POST',
    url: new URL('http://localhost/api/im-omni.webhook/x'),
    headers: { 'x-telegram-bot-api-secret-token': 'tg-secret' },
    rawBody: JSON.stringify(update),
  })
  assert.equal(allowed.status, 200)
  assert.equal(allowed.events[0].message.text, 'Hi')
  assert.equal(allowed.events[0].contact.name, 'Mia')
  assert.equal(parseUpdate(update).externalConversationId, '1001')
})

test('Feishu challenge, signature, and encrypted message parse', async () => {
  const plain = { type: 'url_verification', challenge: 'challenge-1', token: 'verify-token' }
  const channel = { type: 'feishu', config: { verificationToken: 'verify-token' } }
  const challenge = await feishuWebhook(channel, {
    method: 'POST',
    url: new URL('http://localhost/x'),
    headers: {},
    rawBody: JSON.stringify(plain),
  })
  assert.deepEqual(challenge.body, { challenge: 'challenge-1' })

  const event = {
    schema: '2.0',
    header: { event_type: 'im.message.receive_v1', token: 'verify-token', event_id: 'evt' },
    event: {
      sender: { sender_id: { open_id: 'ou_1' } },
      message: {
        message_id: 'om_1',
        chat_id: 'oc_1',
        chat_type: 'p2p',
        message_type: 'text',
        create_time: '1788000000000',
        content: JSON.stringify({ text: 'Feishu hi' }),
      },
    },
  }
  const rawEvent = JSON.stringify(event)
  const encrypted = JSON.stringify({ encrypt: encryptFeishu('encrypt-key', rawEvent) })
  const timestamp = '1788000000'
  const nonce = 'abc'
  const signature = sha256Hex(`${timestamp}${nonce}encrypt-key${encrypted}`)
  const response = await feishuWebhook({ type: 'feishu', config: { verificationToken: 'verify-token', encryptKey: 'encrypt-key' } }, {
    method: 'POST',
    url: new URL('http://localhost/x'),
    headers: { 'x-lark-request-timestamp': timestamp, 'x-lark-request-nonce': nonce, 'x-lark-signature': signature },
    rawBody: encrypted,
  })
  assert.equal(response.status, 200)
  assert.equal(response.events[0].message.text, 'Feishu hi')
  assert.equal(response.events[0].externalConversationId, 'oc_1')

  const invalid = await feishuWebhook({ type: 'feishu', config: { verificationToken: 'verify-token', encryptKey: 'encrypt-key' } }, {
    method: 'POST',
    url: new URL('http://localhost/x'),
    headers: { 'x-lark-request-timestamp': timestamp, 'x-lark-request-nonce': nonce, 'x-lark-signature': 'bad' },
    rawBody: encrypted,
  })
  assert.equal(invalid.status, 401)
})

test('WeCom URL verification and encrypted XML callback parse', async () => {
  const encodingAESKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'
  const channel = {
    type: 'wecom',
    config: { corpId: 'ww123', callbackToken: 'callback-token', encodingAESKey, agentId: '1000002' },
  }
  const echo = encryptWecom(encodingAESKey, 'echo-ok', 'ww123')
  const verified = await wecomWebhook(channel, {
    method: 'GET',
    url: wecomUrl('callback-token', echo),
    headers: {},
    rawBody: '',
  })
  assert.equal(verified.status, 200)
  assert.equal(verified.body, 'echo-ok')

  const xml = '<xml><ToUserName><![CDATA[ww123]]></ToUserName><FromUserName><![CDATA[zhangsan]]></FromUserName><CreateTime>1788000000</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content><MsgId>123456789</MsgId><AgentID>1000002</AgentID></xml>'
  const encrypted = encryptWecom(encodingAESKey, xml, 'ww123')
  const response = await wecomWebhook(channel, {
    method: 'POST',
    url: wecomUrl('callback-token', encrypted),
    headers: {},
    rawBody: `<xml><ToUserName><![CDATA[ww123]]></ToUserName><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`,
  })
  assert.equal(response.status, 200)
  assert.equal(response.body, 'success')
  assert.equal(response.events[0].message.text, '你好')
  assert.equal(response.events[0].externalUserId, 'zhangsan')
})

test('Slack, LINE, DingTalk and Discord callbacks normalize correctly', async () => {
  const slackBody = JSON.stringify({
    type: 'event_callback',
    event: { type: 'message', channel: 'C1', user: 'U1', text: '<@BOT> hello', ts: '1788000000.0001' },
  })
  const slackTimestamp = String(Math.floor(Date.now() / 1000))
  const slack = await slackWebhook({ type: 'slack', config: { signingSecret: 'slack-secret' } }, {
    method: 'POST',
    url: new URL('http://localhost/x'),
    headers: {
      'x-slack-request-timestamp': slackTimestamp,
      'x-slack-signature': `v0=${hmac('slack-secret', `v0:${slackTimestamp}:${slackBody}`)}`,
    },
    rawBody: slackBody,
  })
  assert.equal(slack.events[0].message.text, 'hello')

  const lineBody = JSON.stringify({
    events: [{ type: 'message', timestamp: 1788000000000, source: { type: 'user', userId: 'U2' }, message: { type: 'text', id: 'L1', text: 'LINE hi' } }],
  })
  const line = await lineWebhook({ type: 'line', config: { channelSecret: 'line-secret' } }, {
    method: 'POST',
    url: new URL('http://localhost/x'),
    headers: { 'x-line-signature': hmac('line-secret', lineBody, 'base64') },
    rawBody: lineBody,
  })
  assert.equal(line.events[0].message.text, 'LINE hi')
  assert.equal(line.events[0].externalConversationId, 'U2')

  const dingBody = JSON.stringify({
    conversationId: 'cid_1', senderStaffId: 'staff_1', senderNick: '小明', msgId: 'D1',
    msgtype: 'text', text: { content: '钉钉 hi' }, createAt: 1788000000000,
    sessionWebhook: 'https://oapi.dingtalk.com/robot/sendBySession?session=1',
    sessionWebhookExpiredTime: Date.now() + 60_000,
  })
  const dingTimestamp = String(Date.now())
  const ding = await dingtalkWebhook({ type: 'dingtalk', config: { signSecret: 'ding-secret' } }, {
    method: 'POST',
    url: new URL('http://localhost/x'),
    headers: {
      timestamp: dingTimestamp,
      sign: encodeURIComponent(hmac('ding-secret', `${dingTimestamp}\nding-secret`, 'base64')),
    },
    rawBody: dingBody,
  })
  assert.equal(ding.events[0].message.text, '钉钉 hi')
  assert.equal(ding.events[0].contact.name, '小明')

  const discord = parseMessage({
    id: 'M1',
    channel_id: 'CH1',
    content: 'Discord hi',
    timestamp: '2026-10-31T00:00:00.000Z',
    author: { id: 'U3', username: 'mia', global_name: 'Mia', bot: false },
  })
  assert.equal(discord.message.text, 'Discord hi')
  assert.equal(discord.externalConversationId, 'CH1')
})

test('QR bridge status and inbound token flow', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/session\/status/)
    return Response.json({ status: 'connected', account: '+86 138 0000 0000' })
  }
  const channel = { id: 'chn_qr', type: 'whatsapp_qr', config: { bridgeUrl: 'http://127.0.0.1:8790', bridgeToken: 'bridge-secret' } }
  const current = await qrStatus(channel)
  assert.equal(current.status, 'connected')
  assert.equal(current.account, '+86 138 0000 0000')

  const body = JSON.stringify({ event: 'message.created', externalConversationId: '86138', contact: { id: '86138', name: 'QR user' }, message: { text: 'QR hi' } })
  const unauthorized = await qrWebhook(channel, { method: 'POST', url: new URL('http://localhost/x'), headers: {}, rawBody: body })
  assert.equal(unauthorized.status, 401)
  const accepted = await qrWebhook(channel, {
    method: 'POST',
    url: new URL('http://localhost/x'),
    headers: { authorization: 'Bearer bridge-secret' },
    rawBody: body,
  })
  assert.equal(accepted.status, 202)
  assert.equal(accepted.events.length, 1)
})

test('store snapshot includes catalog and never leaks configured secrets', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'im-omni-store-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new Store(path.join(directory, 'state.json'))
  await store.load()
  store.state.channels.push({
    id: 'chn_secret',
    type: 'telegram',
    name: 'Secret bot',
    config: { botToken: '123:secret', mode: 'polling' },
    status: 'active',
    secret: 'internal-secret',
    stats: {},
  })
  const snapshot = publicState(store.state)
  assert.ok(snapshot.channelPlatforms.length >= 10)
  assert.equal(snapshot.channels.find((channel) => channel.id === 'chn_secret').config.botToken, '••••••••')
  assert.doesNotMatch(JSON.stringify(snapshot), /123:secret|internal-secret/)
})
