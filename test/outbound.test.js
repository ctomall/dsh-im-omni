/**
 * Native outbound senders against a mocked provider network.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import * as whatsapp from '../lib/channels/whatsapp-cloud.js'
import * as feishu from '../lib/channels/feishu.js'
import * as wecom from '../lib/channels/wecom.js'
import * as slack from '../lib/channels/slack.js'
import * as discord from '../lib/channels/discord.js'
import * as line from '../lib/channels/line.js'
import * as dingtalk from '../lib/channels/dingtalk.js'
import * as qr from '../lib/channels/qr-bridge.js'
import { sendOutbound } from '../lib/channels/index.js'

/** A conversation/message pair with portable fields. */
function outbound() {
  return {
    conversation: { id: 'cnv_1', externalId: 'user-1', replyContext: { messageThreadId: 7, threadTs: '1788000000.0001', sessionWebhook: 'https://oapi.dingtalk.com/robot/sendBySession?session=x', expiresAt: Date.now() + 60_000 } },
    message: { id: 'msg_1', text: 'Hello from DSH' },
  }
}

test('all native adapters build the expected provider requests', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url)
    const body = init.body === undefined ? null : (() => { try { return JSON.parse(String(init.body)) } catch { return String(init.body) } })()
    calls.push({ url: target, body, headers: init.headers ?? {} })
    if (target.includes('tenant_access_token')) return Response.json({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 })
    if (target.includes('gettoken')) return Response.json({ errcode: 0, access_token: 'wecom-token', expires_in: 7200 })
    if (target.includes('oauth2/accessToken')) return Response.json({ accessToken: 'ding-token', expireIn: 7200 })
    if (target.includes('/messages') && target.includes('graph.facebook.com')) return Response.json({ messages: [{ id: 'wamid.out' }] })
    if (target.includes('api.telegram.org')) return Response.json({ ok: true, result: { message_id: 9 } })
    if (target.includes('open.feishu.cn')) return Response.json({ code: 0, data: { message_id: 'om_out' } })
    if (target.includes('qyapi.weixin.qq.com/cgi-bin/message/send')) return Response.json({ errcode: 0, msgid: 'wx_out' })
    if (target.includes('slack.com/api/chat.postMessage')) return Response.json({ ok: true, ts: '1788.1' })
    if (target.includes('discord.com/api')) return Response.json({ id: 'dc_out' })
    if (target.includes('api.line.me')) return Response.json({ sentMessages: [{ id: 'line_out' }] })
    if (target.includes('api.dingtalk.com')) return Response.json({ processQueryKey: 'ding_out' })
    if (target.includes('oapi.dingtalk.com')) return Response.json({ errcode: 0 })
    if (target.includes('session/status')) return Response.json({ status: 'connected', account: '+1' })
    if (target.includes('messages/send')) return Response.json({ ok: true, id: 'bridge_out' })
    return Response.json({ ok: true })
  }
  const { conversation, message } = outbound()

  const wa = await whatsapp.send({ type: 'whatsapp_cloud', config: { phoneNumberId: '123', accessToken: 'wa-token', graphVersion: 'v23.0' } }, conversation, message)
  assert.equal(wa.ok, true)
  assert.equal(calls.at(-1).body.to, 'user-1')

  const tg = await sendOutbound({}, { type: 'telegram', config: { botToken: '123:token' } }, conversation, message)
  assert.equal(tg.ok, true)
  assert.equal(calls.at(-1).url, 'https://api.telegram.org/bot123:token/sendMessage')

  const fs = await feishu.send({ type: 'feishu', config: { appId: 'cli_x', appSecret: 'secret' } }, conversation, message)
  assert.equal(fs.ok, true)
  assert.equal(calls.at(-1).body.receive_id, 'user-1')

  const wc = await wecom.send({ type: 'wecom', config: { corpId: 'ww1', secret: 'app-secret', agentId: '1000002' } }, conversation, message)
  assert.equal(wc.ok, true)
  assert.equal(calls.at(-1).body.agentid, 1000002)

  const sl = await slack.send({ type: 'slack', config: { botToken: 'xoxb-1' } }, conversation, message)
  assert.equal(sl.ok, true)
  assert.equal(calls.at(-1).body.thread_ts, '1788000000.0001')

  const dc = await discord.send({ type: 'discord', config: { botToken: 'dc-token' } }, conversation, message)
  assert.equal(dc.ok, true)
  assert.equal(calls.at(-1).url, 'https://discord.com/api/v10/channels/user-1/messages')

  const ln = await line.send({ type: 'line', config: { channelAccessToken: 'line-token' } }, conversation, message)
  assert.equal(ln.ok, true)
  assert.equal(calls.at(-1).body.messages[0].text, 'Hello from DSH')

  const dt = await dingtalk.send({ type: 'dingtalk', config: { robotCode: '' } }, conversation, message)
  assert.equal(dt.ok, true)
  assert.equal(calls.at(-1).body.text.content, 'Hello from DSH')

  const qb = await qr.send({ type: 'whatsapp_qr', config: { bridgeUrl: 'http://127.0.0.1:8790', bridgeToken: 'bridge', sessionName: 'default' } }, conversation, message)
  assert.equal(qb.ok, true)
  assert.equal(qb.externalId, 'bridge_out')
  assert.equal(calls.at(-1).url, 'http://127.0.0.1:8790/messages/send')
})
