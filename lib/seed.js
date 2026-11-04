/**
 * First-run demo workspace for the IM omnichannel plugin.
 *
 * The demo channels use the generic HTTP bridge contract so the complete
 * inbox can be evaluated without provider credentials. Settings can clear or
 * replace them at any time; native channels are created from the channel page.
 * @module @local/im-omni/lib/seed
 */
import { makeId, makeSecret, nowIso } from './util.js'

/** Minutes before first load. */
const startedAt = Date.now()

/**
 * ISO timestamp a number of minutes before the seed instant.
 * @param {number} minutes - minutes ago.
 * @returns {string} ISO timestamp.
 */
function ago(minutes) {
  return new Date(startedAt - minutes * 60_000).toISOString()
}

/**
 * ISO timestamp a number of minutes after the seed instant.
 * @param {number} minutes - minutes ahead.
 * @returns {string} ISO timestamp.
 */
function ahead(minutes) {
  return new Date(startedAt + minutes * 60_000).toISOString()
}

/**
 * Build one message with the shared envelope.
 * @param {string} direction - in, out, note, or system.
 * @param {string} body - message text.
 * @param {string} createdAt - ISO timestamp.
 * @param {Record<string, unknown>} [extra] - additional fields.
 * @returns {Record<string, unknown>} message record.
 */
function message(direction, body, createdAt, extra = {}) {
  return {
    id: makeId('msg'),
    direction,
    kind: 'text',
    text: body,
    attachments: [],
    status: direction === 'in' ? 'received' : direction === 'note' ? 'local' : 'sent',
    createdAt,
    ...extra,
  }
}

/**
 * Derive the conversation timing fields from its messages.
 * @param {Record<string, unknown>} conversation - conversation shell.
 * @returns {Record<string, unknown>} completed conversation.
 */
function withTiming(conversation) {
  const messages = /** @type {Array<Record<string, any>>} */ (conversation.messages)
  const inbound = messages.filter((item) => item.direction === 'in')
  const outbound = messages.filter((item) => item.direction === 'out')
  const firstInbound = inbound[0]
  const firstOutbound = firstInbound === undefined
    ? undefined
    : outbound.find((item) => item.createdAt >= firstInbound.createdAt)
  return {
    ...conversation,
    unread: conversation.unread ?? 0,
    createdAt: messages[0]?.createdAt ?? ago(120),
    updatedAt: messages[messages.length - 1]?.createdAt ?? ago(120),
    lastInboundAt: inbound[inbound.length - 1]?.createdAt ?? null,
    lastOutboundAt: outbound[outbound.length - 1]?.createdAt ?? null,
    firstResponseAt: firstOutbound?.createdAt ?? null,
    resolvedAt: conversation.resolvedAt ?? null,
    snoozedUntil: conversation.snoozedUntil ?? null,
  }
}

/**
 * Create the first-run state.
 * @returns {Record<string, any>} complete state.
 */
export function seedState() {
  const you = { id: 'agent_you', name: 'You', email: 'you@example.com', role: 'admin', availability: 'online', hue: 222, createdAt: ago(60 * 24 * 30) }
  const mia = { id: 'agent_mia', name: 'Mia Chen', email: 'mia@example.com', role: 'agent', availability: 'online', hue: 168, createdAt: ago(60 * 24 * 26) }
  const noah = { id: 'agent_noah', name: 'Noah Park', email: 'noah@example.com', role: 'agent', availability: 'busy', hue: 265, createdAt: ago(60 * 24 * 20) }
  const ava = { id: 'agent_ava', name: 'Ava Singh', email: 'ava@example.com', role: 'agent', availability: 'offline', hue: 24, createdAt: ago(60 * 24 * 12) }

  const web = {
    id: 'chn_web',
    name: 'Website chat',
    description: 'Live chat widget on the storefront. Bridged over HTTPS.',
    type: 'webhook',
    status: 'active',
    outboundUrl: 'demo://website',
    config: { outboundUrl: 'demo://website', bridgeToken: makeSecret() },
    secret: makeSecret(),
    runtime: { health: 'connected', lastCheckedAt: ago(4), lastError: '', account: '', qrStatus: 'disconnected' },
    createdAt: ago(60 * 24 * 28),
    updatedAt: ago(60 * 3),
    stats: { inbound: 128, outbound: 214, lastInboundAt: ago(4), lastOutboundAt: ago(3), lastError: '' },
  }
  const app = {
    id: 'chn_app',
    name: 'Mobile app',
    description: 'In-app support tab for iOS and Android.',
    type: 'webhook',
    status: 'active',
    outboundUrl: 'demo://mobile',
    config: { outboundUrl: 'demo://mobile', bridgeToken: makeSecret() },
    secret: makeSecret(),
    runtime: { health: 'connected', lastCheckedAt: ago(4), lastError: '', account: '', qrStatus: 'disconnected' },
    createdAt: ago(60 * 24 * 24),
    updatedAt: ago(60 * 5),
    stats: { inbound: 86, outbound: 151, lastInboundAt: ago(18), lastOutboundAt: ago(16), lastError: '' },
  }
  const partner = {
    id: 'chn_partner',
    name: 'Partner API',
    description: 'Server-to-server bridge for marketplace and partner platforms.',
    type: 'webhook',
    status: 'paused',
    outboundUrl: 'demo://partner',
    config: { outboundUrl: 'demo://partner', bridgeToken: makeSecret() },
    secret: makeSecret(),
    runtime: { health: 'connected', lastCheckedAt: ago(4), lastError: '', account: '', qrStatus: 'disconnected' },
    createdAt: ago(60 * 24 * 18),
    updatedAt: ago(60 * 26),
    stats: { inbound: 42, outbound: 63, lastInboundAt: ago(60 * 8), lastOutboundAt: ago(60 * 7), lastError: '' },
  }

  const lin = {
    id: 'ct_lin', name: 'Lin Yue', handle: '@linyue', email: 'lin.yue@example.com', phone: '+86 138 0000 1122',
    company: 'Northwind Studio', hue: 210, tags: ['vip', 'refund'], attributes: { plan: 'Pro', locale: 'zh-CN', since: '2025-04-18' },
    identities: [{ channelId: 'chn_web', externalId: 'visitor_lin' }, { channelId: 'chn_app', externalId: 'user_lin' }],
    createdAt: ago(60 * 24 * 90), lastSeenAt: ago(4), notes: [{ id: makeId('note'), body: 'Prefers replies in Chinese. Enterprise renewal in November.', authorId: 'agent_mia', createdAt: ago(60 * 24 * 4) }],
  }
  const diego = {
    id: 'ct_diego', name: 'Diego Ramos', handle: '@diego.r', email: 'diego@example.com', phone: '+34 600 000 213',
    company: 'Ramos Digital', hue: 16, tags: ['bug'], attributes: { plan: 'Team', locale: 'es-ES', since: '2025-09-02' },
    identities: [{ channelId: 'chn_app', externalId: 'user_diego' }],
    createdAt: ago(60 * 24 * 54), lastSeenAt: ago(18), notes: [],
  }
  const priya = {
    id: 'ct_priya', name: 'Priya Nair', handle: '@priya.n', email: 'priya@example.com', phone: '+91 90000 31008',
    company: 'Nair & Co', hue: 292, tags: ['shipping', 'vip'], attributes: { plan: 'Business', locale: 'en-IN', since: '2024-12-11' },
    identities: [{ channelId: 'chn_web', externalId: 'visitor_priya' }],
    createdAt: ago(60 * 24 * 140), lastSeenAt: ago(0.8), notes: [{ id: makeId('note'), body: 'High-value account. Escalate shipping delays immediately.', authorId: 'agent_noah', createdAt: ago(60 * 24 * 2) }],
  }
  const hana = {
    id: 'ct_hana', name: 'Hana Sato', handle: '@hana.s', email: 'hana@example.com', phone: '+81 80 0000 7788',
    company: 'Sato Labs', hue: 336, tags: ['api'], attributes: { plan: 'Developer', locale: 'ja-JP', since: '2026-01-09' },
    identities: [{ channelId: 'chn_partner', externalId: 'partner_hana' }],
    createdAt: ago(60 * 24 * 30), lastSeenAt: ago(60 * 8), notes: [],
  }
  const tom = {
    id: 'ct_tom', name: 'Tom Becker', handle: '@tom.b', email: 'tom@example.com', phone: '+49 151 0000 9921',
    company: 'Becker Works', hue: 48, tags: ['feature'], attributes: { plan: 'Pro', locale: 'de-DE', since: '2025-07-21' },
    identities: [{ channelId: 'chn_app', externalId: 'user_tom' }],
    createdAt: ago(60 * 24 * 71), lastSeenAt: ago(51), notes: [],
  }
  const aisha = {
    id: 'ct_aisha', name: 'Aisha Khan', handle: '@aisha.k', email: 'aisha@example.com', phone: '+44 7700 000 431',
    company: 'Khan Studio', hue: 124, tags: ['vip'], attributes: { plan: 'Business', locale: 'en-GB', since: '2024-10-04' },
    identities: [{ channelId: 'chn_web', externalId: 'visitor_aisha' }],
    createdAt: ago(60 * 24 * 200), lastSeenAt: ago(60 * 3), notes: [],
  }
  const lucas = {
    id: 'ct_lucas', name: 'Lucas Meyer', handle: '@lucas.m', email: 'lucas@example.com', phone: '+33 6 00 00 88 21',
    company: 'Meyer Commerce', hue: 190, tags: ['api', 'integration'], attributes: { plan: 'Enterprise', locale: 'fr-FR', since: '2024-06-17' },
    identities: [{ channelId: 'chn_partner', externalId: 'partner_lucas' }],
    createdAt: ago(60 * 24 * 220), lastSeenAt: ago(60 * 5), notes: [],
  }
  const mei = {
    id: 'ct_mei', name: 'Mei Wong', handle: '@mei.w', email: 'mei@example.com', phone: '+852 5000 0123',
    company: 'Wong Atelier', hue: 260, tags: ['feedback'], attributes: { plan: 'Team', locale: 'zh-HK', since: '2025-11-30' },
    identities: [{ channelId: 'chn_web', externalId: 'visitor_mei' }],
    createdAt: ago(60 * 24 * 40), lastSeenAt: ago(60 * 24), notes: [],
  }

  const conversations = [
    withTiming({
      id: 'cnv_lin', channelId: 'chn_web', contactId: 'ct_lin', subject: 'Refund for order #4821',
      status: 'open', priority: 'high', assigneeId: 'agent_mia', tags: ['refund', 'vip'], unread: 2, externalId: 'visitor_lin',
      messages: [
        message('in', '你好，订单 #4821 已经签收，但其中一件商品有破损。可以申请退款吗？', ago(27), { externalId: 'web_9001' }),
        message('out', '你好 Lin，很抱歉收到这样的体验。请拍一张破损处的照片，我这边马上为你处理退款。', ago(25), { agentId: 'agent_mia' }),
        message('in', '照片已经上传到订单售后页了。', ago(8), { externalId: 'web_9002' }),
        message('in', '另外退款大概多久能到账？', ago(4), { externalId: 'web_9003' }),
        message('note', '已核对售后页照片。走破损免退货流程，财务今天处理。', ago(3), { agentId: 'agent_mia' }),
      ],
    }),
    withTiming({
      id: 'cnv_diego', channelId: 'chn_app', contactId: 'ct_diego', subject: 'Push notifications not arriving',
      status: 'pending', priority: 'normal', assigneeId: 'agent_noah', tags: ['bug'], unread: 0, externalId: 'thread_diego_1',
      messages: [
        message('in', 'Since the last update I do not receive push notifications on Android.', ago(58), { externalId: 'app_7711' }),
        message('out', 'Thanks Diego. Could you confirm the app version and whether battery saver is on?', ago(54), { agentId: 'agent_noah' }),
        message('in', 'Version 4.8.2, battery saver is off. Still nothing.', ago(18), { externalId: 'app_7712' }),
        message('out', 'Got it. I have escalated this to the mobile team and will update you here.', ago(16), { agentId: 'agent_noah' }),
      ],
    }),
    withTiming({
      id: 'cnv_priya', channelId: 'chn_web', contactId: 'ct_priya', subject: 'Where is my shipment?',
      status: 'open', priority: 'urgent', assigneeId: null, tags: ['shipping', 'vip'], unread: 3, externalId: 'visitor_priya',
      messages: [
        message('in', 'My order was supposed to arrive two days ago. The tracking page has not moved.', ago(41), { externalId: 'web_8101' }),
        message('in', 'This is for a client presentation on Friday. I need a real answer, not a template.', ago(39), { externalId: 'web_8102' }),
        message('in', 'Order number is NS-20831.', ago(0.8), { externalId: 'web_8103' }),
      ],
    }),
    withTiming({
      id: 'cnv_hana', channelId: 'chn_partner', contactId: 'ct_hana', subject: 'API rate limit increase',
      status: 'resolved', priority: 'normal', assigneeId: 'agent_you', tags: ['api'], unread: 0, externalId: 'partner_thread_hana',
      resolvedAt: ago(60 * 7),
      messages: [
        message('in', 'We are preparing a launch and expect 3x the current API volume. Can our limit be raised?', ago(60 * 9), { externalId: 'partner_3101' }),
        message('out', 'Hi Hana, I raised the limit to 600 requests per minute for your workspace. It is active now.', ago(60 * 8), { agentId: 'agent_you' }),
        message('in', 'Confirmed, thank you!', ago(60 * 7), { externalId: 'partner_3102' }),
        message('system', 'Conversation resolved by You.', ago(60 * 7)),
      ],
    }),
    withTiming({
      id: 'cnv_tom', channelId: 'chn_app', contactId: 'ct_tom', subject: 'Feature request: shared views',
      status: 'open', priority: 'low', assigneeId: null, tags: ['feature'], unread: 1, externalId: 'thread_tom_1',
      messages: [
        message('in', 'It would be useful to save a filtered inbox view and share it with my team.', ago(52), { externalId: 'app_5501' }),
        message('out', 'Thanks Tom, that is a great suggestion. I have logged it for the product team.', ago(50), { agentId: 'agent_mia' }),
        message('in', 'Great. Is there an ETA?', ago(48.8), { externalId: 'app_5502' }),
      ],
    }),
    withTiming({
      id: 'cnv_aisha', channelId: 'chn_web', contactId: 'ct_aisha', subject: 'Invoice copy for September',
      status: 'snoozed', priority: 'normal', assigneeId: 'agent_mia', tags: ['billing', 'vip'], unread: 0, externalId: 'visitor_aisha',
      snoozedUntil: ahead(120),
      messages: [
        message('in', 'Could you send a PDF copy of our September invoice?', ago(60 * 3), { externalId: 'web_4401' }),
        message('out', 'Of course. I have requested it from billing and will send it here once it arrives.', ago(60 * 3 - 4), { agentId: 'agent_mia' }),
      ],
    }),
    withTiming({
      id: 'cnv_lucas', channelId: 'chn_partner', contactId: 'ct_lucas', subject: 'Webhook signature mismatch',
      status: 'pending', priority: 'high', assigneeId: 'agent_noah', tags: ['api', 'integration'], unread: 0, externalId: 'partner_thread_lucas',
      messages: [
        message('in', 'Our webhook verifier rejects every event with a signature mismatch after we rotated the secret.', ago(60 * 5), { externalId: 'partner_6201' }),
        message('out', 'I regenerated the secret on our side. Please update your verifier and send one test event.', ago(60 * 5 - 7), { agentId: 'agent_noah' }),
        message('in', 'Test event accepted. We are back online, thanks.', ago(60 * 5 - 12), { externalId: 'partner_6202' }),
      ],
    }),
    withTiming({
      id: 'cnv_mei', channelId: 'chn_web', contactId: 'ct_mei', subject: 'Loved the new dashboard',
      status: 'resolved', priority: 'normal', assigneeId: 'agent_you', tags: ['feedback'], unread: 0, externalId: 'visitor_mei',
      resolvedAt: ago(60 * 23),
      messages: [
        message('in', 'The new dashboard is much easier to scan. Please pass this to the design team.', ago(60 * 24), { externalId: 'web_3301' }),
        message('out', 'That made our day, Mei. I have shared it with the design team. Thank you!', ago(60 * 23.8), { agentId: 'agent_you' }),
        message('system', 'Conversation resolved by You.', ago(60 * 23)),
      ],
    }),
  ]

  return {
    version: 1,
    demo: true,
    workspace: {
      name: 'Acme Support',
      timezone: 'Asia/Shanghai',
      businessHours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
      autoAssign: true,
      defaultSlaMinutes: 30,
      autoTranslate: true,
      translationTarget: 'zh-CN',
      aiSuggestions: true,
      bot: { enabled: false, name: 'AI 接待', greeting: '', instructions: '', handoffKeywords: '人工,转人工,投诉,退款,human,agent', maxTurns: 12 },
      currentAgentId: 'agent_you',
    },
    agents: [you, mia, noah, ava],
    channels: [web, app, partner],
    contacts: [lin, diego, priya, hana, tom, aisha, lucas, mei],
    conversations,
    templates: [
      { id: 'tpl_greeting', name: 'Warm greeting', shortcut: '/hi', body: 'Hi {{contact.name}}, thanks for reaching out to {{workspace.name}}. How can I help today?', channelIds: [], locale: 'en', usageCount: 46, createdAt: ago(60 * 24 * 20), updatedAt: ago(60 * 24 * 20) },
      { id: 'tpl_refund', name: 'Refund received', shortcut: '/refund', body: 'Hi {{contact.name}}, I have received your refund request. Our team will review it and reply within one business day. Reference: {{conversation.id}}.', channelIds: [], locale: 'en', usageCount: 31, createdAt: ago(60 * 24 * 18), updatedAt: ago(60 * 24 * 3) },
      { id: 'tpl_shipping', name: 'Shipping trace', shortcut: '/ship', body: 'Hi {{contact.name}}, I am checking the carrier trace now. I will update you here as soon as it moves.', channelIds: ['chn_web'], locale: 'en', usageCount: 58, createdAt: ago(60 * 24 * 16), updatedAt: ago(60 * 24 * 2) },
      { id: 'tpl_api', name: 'API escalation', shortcut: '/api', body: 'Hi {{contact.name}}, I have escalated this to our platform team. We will follow up with a concrete timeline.', channelIds: ['chn_partner'], locale: 'en', usageCount: 12, createdAt: ago(60 * 24 * 12), updatedAt: ago(60 * 24 * 12) },
      { id: 'tpl_cn', name: '中文问候', shortcut: '/你好', body: '你好 {{contact.name}}，感谢联系 {{workspace.name}}。请问有什么可以帮你？', channelIds: [], locale: 'zh', usageCount: 74, createdAt: ago(60 * 24 * 22), updatedAt: ago(60 * 24 * 22) },
    ],
    automations: [
      {
        id: 'atm_refund', name: 'Tag refund requests', enabled: true, trigger: 'message.received',
        conditions: { keyword: 'refund' }, actions: [{ type: 'tag', value: 'refund' }],
        runCount: 19, lastRunAt: ago(27), createdAt: ago(60 * 24 * 15), updatedAt: ago(60 * 24 * 15),
      },
      {
        id: 'atm_urgent', name: 'Escalate urgent language', enabled: true, trigger: 'message.received',
        conditions: { keyword: 'urgent' }, actions: [{ type: 'priority', value: 'urgent' }, { type: 'tag', value: 'escalated' }],
        runCount: 6, lastRunAt: ago(39), createdAt: ago(60 * 24 * 10), updatedAt: ago(60 * 24 * 10),
      },
      {
        id: 'atm_vip_route', name: 'Route VIP contacts', enabled: true, trigger: 'conversation.created',
        conditions: { contactTag: 'vip' }, actions: [{ type: 'assign', value: 'agent_mia' }],
        runCount: 34, lastRunAt: ago(4), createdAt: ago(60 * 24 * 9), updatedAt: ago(60 * 24 * 9),
      },
    ],
    broadcasts: [
      {
        id: 'brd_october', name: 'October product update', channelId: 'chn_web', body: 'Hi {{contact.name}}, the October release is live: saved views, faster search, and a new analytics page. Reply here if you would like a walkthrough.',
        audienceTag: 'vip', scheduledAt: null, status: 'sent', stats: { targeted: 3, sent: 3, failed: 0 },
        createdAt: ago(60 * 24 * 3), sentAt: ago(60 * 24 * 2),
      },
      {
        id: 'brd_maintenance', name: 'Weekend maintenance notice', channelId: 'chn_app', body: 'Heads up: the mobile app will be read-only on Saturday from 02:00 to 03:00 UTC for scheduled maintenance.',
        audienceTag: '', scheduledAt: ahead(60 * 18), status: 'scheduled', stats: { targeted: 0, sent: 0, failed: 0 },
        createdAt: ago(60 * 6), sentAt: null,
      },
      {
        id: 'brd_draft', name: 'API v2 migration guide', channelId: 'chn_partner', body: 'Hi {{contact.name}}, we published the API v2 migration guide. Your current keys keep working through December.',
        audienceTag: 'api', scheduledAt: null, status: 'draft', stats: { targeted: 0, sent: 0, failed: 0 },
        createdAt: ago(60 * 30), sentAt: null,
      },
    ],
    events: [
      { id: makeId('evt'), type: 'conversation.created', conversationId: 'cnv_priya', channelId: 'chn_web', actorId: null, text: 'New conversation from Priya Nair', createdAt: ago(41) },
      { id: makeId('evt'), type: 'automation.ran', conversationId: 'cnv_priya', channelId: 'chn_web', actorId: null, text: 'Automation "Escalate urgent language" applied priority urgent', createdAt: ago(39) },
      { id: makeId('evt'), type: 'message.received', conversationId: 'cnv_priya', channelId: 'chn_web', actorId: null, text: 'Priya Nair sent a message', createdAt: ago(0.8) },
      { id: makeId('evt'), type: 'broadcast.sent', conversationId: null, channelId: 'chn_web', actorId: 'agent_you', text: 'Broadcast "October product update" sent to 3 contacts', createdAt: ago(60 * 24 * 2) },
    ],
    meta: { revision: 1, createdAt: nowIso(), updatedAt: nowIso() },
  }
}
