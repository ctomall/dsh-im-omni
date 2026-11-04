import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWecomPayload,
  inQuietHours,
  linkFor,
  notifyInbound,
  previewOf,
  sendTestNotification,
} from '../lib/notify.js'

/** Minimal state with one conversation and one inbound message. */
function stateWith(overrides = {}) {
  const workspace = {
    notify: {
      enabled: true,
      wecomWebhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
      quietStart: '',
      quietEnd: '',
      privatePreview: false,
      linkTemplate: 'dshomni://chat/{conversationId}',
      ...(overrides.notify ?? {}),
    },
  }
  const conversation = {
    id: 'cnv_1',
    contactId: 'ct_1',
    channelId: 'chn_1',
    status: 'open',
    unread: 2,
    messages: [
      { id: 'msg_1', direction: 'in', text: '订单什么时候到？', attachments: [] },
    ],
    ...(overrides.conversation ?? {}),
  }
  return {
    workspace,
    contacts: [{ id: 'ct_1', name: '林小满' }],
    channels: [{ id: 'chn_1', name: '售后 WhatsApp' }],
    conversations: [conversation],
  }
}

/** Runtime stub that records fetch calls. */
function runtimeWith(state, responses = []) {
  const calls = []
  const queue = [...responses]
  return {
    calls,
    runtime: {
      store: { state },
      logger: { warn: () => {} },
      fetchImpl: async (url, init) => {
        calls.push({ url, init })
        const next = queue.shift() ?? { ok: true, status: 200, body: '{"errcode":0}' }
        return { ok: next.ok, status: next.status, text: async () => next.body }
      },
    },
  }
}

test('quiet hours handle same-day and cross-midnight windows', () => {
  const at = (hour, minute = 0) => new Date(2026, 10, 4, hour, minute)
  assert.equal(inQuietHours(at(23), '22:00', '08:00'), true)
  assert.equal(inQuietHours(at(7), '22:00', '08:00'), true)
  assert.equal(inQuietHours(at(12), '22:00', '08:00'), false)
  assert.equal(inQuietHours(at(12), '09:00', '18:00'), true)
  assert.equal(inQuietHours(at(18), '09:00', '18:00'), false)
  assert.equal(inQuietHours(at(12), '', ''), false)
})

test('preview truncates and can be hidden', () => {
  assert.equal(previewOf({ text: 'a'.repeat(200) }, false).length, 121)
  assert.equal(previewOf({ text: '你好' }, true), '你有一条新消息')
  assert.equal(previewOf({ text: '', attachments: [{ name: 'photo.png' }] }, false), '[附件] photo.png')
})

test('card carries contact, channel, preview and deep link', () => {
  const payload = buildWecomPayload({
    conversation: { unread: 3, status: 'pending' },
    contact: { name: '林小满' },
    channel: { name: '售后 WhatsApp' },
    message: { text: '如果退款的话大概多久到账？' },
    link: 'dshomni://chat/cnv_1',
  })
  assert.equal(payload.msgtype, 'markdown')
  const content = payload.markdown.content
  assert.match(content, /林小满/)
  assert.match(content, /售后 WhatsApp/)
  assert.match(content, /未读 3/)
  assert.match(content, /dshomni:\/\/chat\/cnv_1/)
})

test('linkFor encodes the conversation id', () => {
  assert.equal(linkFor('dshomni://chat/{conversationId}', 'cnv 1'), 'dshomni://chat/cnv%201')
  assert.equal(linkFor('', 'cnv_1'), '')
})

test('disabled notifications never touch the network', async () => {
  const state = stateWith({ notify: { enabled: false } })
  const { runtime, calls } = runtimeWith(state)
  await notifyInbound(runtime, { conversationId: 'cnv_1', messageId: 'msg_1' })
  assert.equal(calls.length, 0)
})

test('quiet hours suppress the card', async () => {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const next = String((now.getHours() + 1) % 24).padStart(2, '0')
  const state = stateWith({ notify: { quietStart: `${hh}:00`, quietEnd: `${next}:00` } })
  const { runtime, calls } = runtimeWith(state)
  await notifyInbound(runtime, { conversationId: 'cnv_1', messageId: 'msg_1' })
  assert.equal(calls.length, 0)
})

test('an enabled notification posts one markdown card', async () => {
  const state = stateWith()
  const { runtime, calls } = runtimeWith(state)
  await notifyInbound(runtime, { conversationId: 'cnv_1', messageId: 'msg_1' })
  assert.equal(calls.length, 1)
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.msgtype, 'markdown')
  assert.match(body.markdown.content, /林小满/)
})

test('a logical WeCom error does not retry', async () => {
  const state = stateWith()
  const { runtime, calls } = runtimeWith(state, [
    { ok: true, status: 200, body: '{"errcode":93000,"errmsg":"invalid webhook url"}' },
  ])
  await notifyInbound(runtime, { conversationId: 'cnv_1', messageId: 'msg_1' })
  assert.equal(calls.length, 1)
})

test('an http failure retries once then gives up', async () => {
  const state = stateWith()
  const { runtime, calls } = runtimeWith(state, [
    { ok: false, status: 502, body: 'bad gateway' },
    { ok: false, status: 502, body: 'bad gateway' },
  ])
  await notifyInbound(runtime, { conversationId: 'cnv_1', messageId: 'msg_1' })
  assert.equal(calls.length, 2)
})

test('test notification requires a webhook', async () => {
  const state = stateWith({ notify: { wecomWebhook: '' } })
  const { runtime } = runtimeWith(state)
  const result = await sendTestNotification(runtime)
  assert.equal(result.ok, false)
})
