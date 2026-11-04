/**
 * Ticketing and channel operations for the IM omnichannel workspace.
 *
 * Commands are serialized by the caller. Each command validates its payload,
 * mutates the plugin document, commits it, and returns a small receipt. Outbound
 * bridge calls are queued after the receipt so the inbox stays responsive.
 * @module dsh-im-omni/lib/commands
 */
import { createHash, randomBytes } from 'node:crypto'
import {
  ApiError,
  equalSecret,
  integer,
  makeId,
  makeSecret,
  nowIso,
  oneOf,
  outboundUrl,
  secretFingerprint,
  signBody,
  text,
} from './util.js'
import { resolveAttachments } from './attachments.js'
import { persistInboundMedia } from './media.js'
import {
  normalizeConfig,
  publicChannel,
  qrLogin,
  qrStatus,
  requireType,
  revealSecrets,
  sendOutbound,
  testChannel,
} from './channels/index.js'

/** Conversation states. */
const STATUSES = ['open', 'pending', 'resolved', 'snoozed']
/** Conversation priorities. */
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
/** Agent availability states. */
const AVAILABILITIES = ['online', 'busy', 'offline']
/** Automation triggers. */
const TRIGGERS = ['message.received', 'conversation.created', 'conversation.assigned']
/** Automation action types. */
const ACTION_TYPES = ['assign', 'tag', 'priority', 'status', 'reply', 'snooze']
/** Maximum broadcast recipients in one run. */
const MAX_BROADCAST_RECIPIENTS = 200

/**
 * Assert that a payload is a plain object.
 * @param {unknown} payload - command payload.
 * @returns {Record<string, any>} payload.
 */
function object(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'bad-payload', 'The command payload must be an object.')
  }
  return /** @type {Record<string, any>} */ (payload)
}

/**
 * Look up a required conversation.
 * @param {Record<string, any>} state - state.
 * @param {unknown} id - id.
 * @returns {Record<string, any>} conversation.
 */
function conversationOf(state, id) {
  const found = state.conversations.find((conversation) => conversation.id === id)
  if (found === undefined) throw new ApiError(404, 'conversation-not-found', 'Conversation not found.')
  return found
}

/**
 * Look up a required contact.
 * @param {Record<string, any>} state - state.
 * @param {unknown} id - id.
 * @returns {Record<string, any>} contact.
 */
function contactOf(state, id) {
  const found = state.contacts.find((contact) => contact.id === id)
  if (found === undefined) throw new ApiError(404, 'contact-not-found', 'Contact not found.')
  return found
}

/**
 * Look up a required channel.
 * @param {Record<string, any>} state - state.
 * @param {unknown} id - id.
 * @returns {Record<string, any>} channel.
 */
function channelOf(state, id) {
  const found = state.channels.find((channel) => channel.id === id)
  if (found === undefined) throw new ApiError(404, 'channel-not-found', 'Channel not found.')
  return found
}

/**
 * Look up an agent, returning undefined for an absent id.
 * @param {Record<string, any>} state - state.
 * @param {unknown} id - id.
 * @returns {Record<string, any>|undefined} agent.
 */
function findAgent(state, id) {
  if (typeof id !== 'string' || id === '') return undefined
  return state.agents.find((agent) => agent.id === id)
}

/**
 * Current acting agent, falling back to the first configured agent.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} payload - payload.
 * @returns {string|null} agent id.
 */
function actingAgent(state, payload) {
  const explicit = findAgent(state, payload.agentId)
  if (explicit !== undefined) return explicit.id
  const current = findAgent(state, state.workspace.currentAgentId)
  if (current !== undefined) return current.id
  return state.agents[0]?.id ?? null
}

/**
 * Choose the online agent with the fewest open conversations.
 * @param {Record<string, any>} state - state.
 * @returns {string|null} agent id.
 */
function chooseAgent(state) {
  const online = state.agents.filter((agent) => agent.availability === 'online')
  const pool = online.length > 0 ? online : state.agents.filter((agent) => agent.availability !== 'offline')
  if (pool.length === 0) return null
  return pool
    .map((agent) => ({
      id: agent.id,
      load: state.conversations.filter((conversation) => conversation.assigneeId === agent.id && conversation.status !== 'resolved').length,
    }))
    .sort((left, right) => left.load - right.load)[0].id
}

/**
 * Assign an unassigned conversation when the workspace enables automatic routing.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} conversation - conversation.
 * @returns {boolean} whether an assignment was made.
 */
function autoAssign(state, conversation) {
  if (!state.workspace.autoAssign || conversation.assigneeId !== null) return false
  const agentId = chooseAgent(state)
  if (agentId === null) return false
  conversation.assigneeId = agentId
  return true
}

/**
 * Normalize tags, de-duplicated and capped.
 * @param {unknown} value - source.
 * @returns {string[]} tags.
 */
function tags(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const result = []
  for (const item of value) {
    const tag = text(item, 40)
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
    if (result.length >= 20) break
  }
  return result
}

/**
 * Normalize an RFC3339 timestamp.
 * @param {unknown} value - source.
 * @param {boolean} [allowNull=true] - whether null/empty is accepted.
 * @returns {string|null} normalized timestamp.
 */
function timestamp(value, allowNull = true) {
  if (value === null || value === undefined || value === '') {
    if (allowNull) return null
    throw new ApiError(400, 'invalid-time', 'A timestamp is required.')
  }
  const parsed = Date.parse(String(value))
  if (!Number.isFinite(parsed)) throw new ApiError(400, 'invalid-time', 'The timestamp is not valid.')
  return new Date(parsed).toISOString()
}

/**
 * Set a conversation status while maintaining resolved/snoozed fields.
 * @param {Record<string, any>} conversation - conversation.
 * @param {string} status - target status.
 * @param {string|null} [snoozedUntil] - snooze deadline.
 * @returns {void}
 */
function setStatus(conversation, status, snoozedUntil = null) {
  if (!STATUSES.includes(status)) throw new ApiError(400, 'invalid-status', 'Unknown conversation status.')
  conversation.status = status
  if (status === 'resolved') {
    conversation.resolvedAt = conversation.resolvedAt ?? nowIso()
    conversation.snoozedUntil = null
  } else if (status === 'snoozed') {
    conversation.snoozedUntil = snoozedUntil ?? conversation.snoozedUntil ?? new Date(Date.now() + 3_600_000).toISOString()
    conversation.resolvedAt = null
  } else {
    conversation.resolvedAt = null
    conversation.snoozedUntil = null
  }
}

/**
 * Render a template against one conversation.
 * @param {string} body - template body.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>|undefined} contact - contact.
 * @param {Record<string, any>|undefined} agent - acting agent.
 * @returns {string} rendered text.
 */
export function renderTemplate(body, state, conversation, contact, agent) {
  return body
    .replaceAll('{{contact.name}}', contact?.name ?? 'there')
    .replaceAll('{{contact.handle}}', contact?.handle ?? '')
    .replaceAll('{{workspace.name}}', state.workspace.name)
    .replaceAll('{{conversation.id}}', conversation.id)
    .replaceAll('{{agent.name}}', agent?.name ?? 'the team')
}

/**
 * Append an outbound message in queued state.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} conversation - conversation.
 * @param {string} body - message body.
 * @param {{agentId?: string|null, templateId?: string|null, broadcastId?: string|null, status?: string}} [options] - delivery metadata.
 * @returns {Record<string, any>} message.
 */
function appendOutbound(state, conversation, body, options = {}) {
  const createdAt = nowIso()
  const message = {
    id: makeId('msg'),
    direction: 'out',
    kind: (options.attachments ?? []).length > 0 ? 'file' : 'text',
    text: body,
    attachments: options.attachments ?? [],
    status: options.status ?? 'queued',
    agentId: options.agentId ?? null,
    sender: options.sender ?? 'agent',
    templateId: options.templateId ?? null,
    broadcastId: options.broadcastId ?? null,
    error: '',
    createdAt,
  }
  conversation.messages.push(message)
  conversation.updatedAt = createdAt
  if (options.firstResponse !== false && conversation.firstResponseAt === null) conversation.firstResponseAt = createdAt
  if (conversation.status === 'resolved' || conversation.status === 'snoozed') {
    setStatus(conversation, 'open')
  }
  conversation.unread = 0
  if (message.templateId !== null) {
    const template = state.templates.find((item) => item.id === message.templateId)
    if (template !== undefined) template.usageCount = (template.usageCount ?? 0) + 1
  }
  return message
}

/**
 * Append an internal note.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} conversation - conversation.
 * @param {string} body - note body.
 * @param {string|null} agentId - author.
 * @returns {Record<string, any>} message.
 */
function appendNote(state, conversation, body, agentId) {
  const createdAt = nowIso()
  const message = {
    id: makeId('msg'),
    direction: 'note',
    kind: 'text',
    text: body,
    attachments: [],
    status: 'local',
    agentId,
    createdAt,
  }
  conversation.messages.push(message)
  conversation.updatedAt = createdAt
  state.events.push({ id: makeId('evt'), type: 'note.created', text: 'Internal note added', conversationId: conversation.id, channelId: conversation.channelId, actorId: agentId, createdAt })
  return message
}

/**
 * Check one automation's conditions.
 * @param {Record<string, any>} automation - automation.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>|undefined} message - triggering inbound message.
 * @returns {boolean} whether the rule applies.
 */
function matchesAutomation(automation, state, conversation, message) {
  const conditions = automation.conditions ?? {}
  if (conditions.channelId !== undefined && conditions.channelId !== '' && conditions.channelId !== conversation.channelId) return false
  if (conditions.keyword !== undefined && conditions.keyword !== '') {
    if (message === undefined) return false
    if (!message.text.toLowerCase().includes(String(conditions.keyword).toLowerCase())) return false
  }
  if (conditions.contactTag !== undefined && conditions.contactTag !== '') {
    const contact = state.contacts.find((item) => item.id === conversation.contactId)
    if (contact === undefined || !contact.tags.includes(conditions.contactTag)) return false
  }
  if (conditions.priority !== undefined && conditions.priority !== '' && conditions.priority !== conversation.priority) return false
  return true
}

/**
 * Apply one automation action.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} action - action.
 * @param {Record<string, any>} automation - automation.
 * @returns {Record<string, any>|undefined} a queued outbound message, when the action replies.
 */
function applyAutomationAction(state, conversation, action, automation) {
  const value = typeof action.value === 'string' ? action.value.trim() : action.value
  switch (action.type) {
    case 'assign': {
      if (value === 'auto') {
        const agentId = chooseAgent(state)
        if (agentId !== null) conversation.assigneeId = agentId
      } else {
        const agent = findAgent(state, value)
        if (agent !== undefined) conversation.assigneeId = agent.id
      }
      return undefined
    }
    case 'tag': {
      const tag = text(value, 40)
      if (tag !== '' && !conversation.tags.includes(tag)) conversation.tags.push(tag)
      return undefined
    }
    case 'priority': {
      if (PRIORITIES.includes(value)) conversation.priority = value
      return undefined
    }
    case 'status': {
      if (STATUSES.includes(value)) setStatus(conversation, value)
      return undefined
    }
    case 'snooze': {
      const minutes = integer(value, 60, 1, 60 * 24 * 30)
      setStatus(conversation, 'snoozed', new Date(Date.now() + minutes * 60_000).toISOString())
      return undefined
    }
    case 'reply': {
      const body = text(value, 8000)
      if (body === '') return undefined
      return appendOutbound(state, conversation, body, { agentId: null })
    }
    default:
      return undefined
  }
}

/**
 * Run matching automations for one trigger.
 * @param {Record<string, any>} state - state.
 * @param {string} trigger - trigger event.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} [message] - inbound message.
 * @returns {string[]} queued message ids.
 */
function runAutomations(state, trigger, conversation, message) {
  const queued = []
  for (const automation of state.automations) {
    if (!automation.enabled || automation.trigger !== trigger) continue
    if (!matchesAutomation(automation, state, conversation, message)) continue
    const applied = []
    for (const action of automation.actions ?? []) {
      if (!ACTION_TYPES.includes(action.type)) continue
      const queuedMessage = applyAutomationAction(state, conversation, action, automation)
      if (queuedMessage !== undefined) queued.push(queuedMessage.id)
      applied.push(action.type)
    }
    automation.runCount = (automation.runCount ?? 0) + 1
    automation.lastRunAt = nowIso()
    if (applied.length > 0) {
      state.events.push({
        id: makeId('evt'),
        type: 'automation.ran',
        text: `Automation "${automation.name}" applied ${applied.join(', ')}`,
        conversationId: conversation.id,
        channelId: conversation.channelId,
        actorId: null,
        createdAt: nowIso(),
      })
    }
  }
  return queued
}

/**
 * Normalize a bridge message payload.
 * @param {Record<string, any>} payload - raw JSON body.
 * @returns {Record<string, any>} normalized event.
 */
function normalizeInbound(payload) {
  const contact = payload.contact !== null && typeof payload.contact === 'object' ? payload.contact : (payload.from ?? {})
  const message = payload.message !== null && typeof payload.message === 'object' ? payload.message : payload
  const body = text(message.text ?? payload.text, 8000)
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.slice(0, 10).map((attachment) => ({
      name: text(attachment?.name, 200),
      url: text(attachment?.url, 2000),
      type: text(attachment?.type, 120),
      size: integer(attachment?.size, 0, 0, 100_000_000),
    })).filter((attachment) => attachment.url !== '')
    : []
  if (body === '' && attachments.length === 0) {
    throw new ApiError(400, 'empty-message', 'The bridge payload must contain message text or an attachment URL.')
  }
  const externalConversationId = text(payload.externalConversationId ?? payload.conversationId ?? payload.threadId, 300)
    || `bridge_${randomBytes(6).toString('hex')}`
  const externalUserId = text(contact.id ?? contact.externalId ?? payload.externalUserId, 300) || externalConversationId
  const externalMessageId = text(payload.externalMessageId ?? message.id ?? payload.messageId, 300)
    || `ext_${createHash('sha1').update(`${externalConversationId}:${body}:${Date.now()}`).digest('hex').slice(0, 16)}`
  let replyContext = null
  if (payload.replyContext !== null && typeof payload.replyContext === 'object' && !Array.isArray(payload.replyContext)) {
    try {
      const encoded = JSON.stringify(payload.replyContext)
      replyContext = encoded.length <= 4096 ? JSON.parse(encoded) : null
    } catch {
      replyContext = null
    }
  }
  return {
    externalConversationId,
    externalUserId,
    alternateUserId: text(payload.alternateUserId, 300),
    externalMessageId,
    contactName: text(contact.name ?? contact.displayName ?? payload.senderName, 120),
    handle: text(contact.handle ?? contact.username, 120),
    email: text(contact.email, 200),
    phone: text(contact.phone, 80),
    body,
    attachments,
    replyContext,
    timestamp: timestamp(payload.timestamp ?? payload.createdAt ?? message.createdAt, true) ?? nowIso(),
  }
}

/**
 * Find or create the contact identity for an inbound bridge event.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} event - normalized event.
 * @returns {Record<string, any>} contact.
 */
function contactForInbound(state, channel, event) {
  let contact = state.contacts.find((item) => (item.identities ?? []).some(
    (identity) => identity.channelId === channel.id && identity.externalId === event.externalUserId,
  ))
  if (contact === undefined && event.alternateUserId !== '') {
    contact = state.contacts.find((item) => (item.identities ?? []).some(
      (identity) => identity.channelId === channel.id && identity.externalId === event.alternateUserId,
    ))
  }
  if (contact === undefined && event.email !== '') {
    contact = state.contacts.find((item) => item.email === event.email)
  }
  if (contact === undefined && event.handle !== '') {
    contact = state.contacts.find((item) => item.handle === event.handle)
  }
  if (contact === undefined) {
    contact = {
      id: makeId('ct'),
      name: event.contactName || event.handle || 'Unknown contact',
      handle: event.handle,
      email: event.email,
      phone: event.phone,
      company: '',
      hue: Math.floor(Math.random() * 360),
      tags: [],
      attributes: {},
      identities: [],
      createdAt: nowIso(),
      lastSeenAt: event.timestamp,
      notes: [],
    }
    state.contacts.push(contact)
    state.events.push({ id: makeId('evt'), type: 'contact.created', text: `Contact "${contact.name}" created by bridge`, conversationId: null, channelId: channel.id, actorId: null, createdAt: nowIso() })
  }
  const alternateIdentity = event.alternateUserId === '' ? undefined : contact.identities.find(
    (identity) => identity.channelId === channel.id && identity.externalId === event.alternateUserId,
  )
  if (alternateIdentity !== undefined && event.alternateUserId !== event.externalUserId) {
    alternateIdentity.externalId = event.externalUserId
  }
  if (!contact.identities.some((identity) => identity.channelId === channel.id && identity.externalId === event.externalUserId)) {
    contact.identities.push({ channelId: channel.id, externalId: event.externalUserId })
  }
  if (event.contactName !== '') contact.name = event.contactName
  if (event.handle !== '') contact.handle = event.handle
  if (event.email !== '') contact.email = event.email
  if (event.phone !== '') contact.phone = event.phone
  contact.lastSeenAt = event.timestamp
  return contact
}

/**
 * Ingest one authenticated bridge event.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} payload - bridge JSON payload.
 * @returns {Record<string, any>} receipt.
 */
function ingestInbound(state, channel, payload) {
  if (channel.status !== 'active') throw new ApiError(409, 'channel-paused', 'This channel is paused.')
  const event = normalizeInbound(payload)
  const duplicate = state.conversations.some((conversation) =>
    conversation.channelId === channel.id
    && conversation.messages.some((message) => message.externalId === event.externalMessageId))
  if (duplicate) return { duplicate: true, conversationId: null, messageId: null, queued: [] }
  const queued = []
  const contact = contactForInbound(state, channel, event)
  let isNewConversation = false
  let assignedByRoute = false
  let conversation = state.conversations
    .filter((item) => item.channelId === channel.id && item.contactId === contact.id && item.externalId === event.externalConversationId)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]
  if (conversation === undefined) {
    conversation = {
      id: makeId('cnv'),
      channelId: channel.id,
      contactId: contact.id,
      subject: event.body.slice(0, 80) || 'New conversation',
      status: 'open',
      priority: 'normal',
      assigneeId: null,
      tags: [],
      unread: 0,
      externalId: event.externalConversationId,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      lastInboundAt: event.timestamp,
      lastOutboundAt: null,
      firstResponseAt: null,
      resolvedAt: null,
      snoozedUntil: null,
      replyContext: event.replyContext ?? null,
      messages: [],
    }
    state.conversations.push(conversation)
    isNewConversation = true
    assignedByRoute = autoAssign(state, conversation)
    state.events.push({ id: makeId('evt'), type: 'conversation.created', text: `New conversation from ${contact.name}`, conversationId: conversation.id, channelId: channel.id, actorId: null, createdAt: event.timestamp })
  }
  if (event.replyContext !== null) conversation.replyContext = event.replyContext
  const message = {
    id: makeId('msg'),
    direction: 'in',
    kind: event.attachments.length > 0 ? 'file' : 'text',
    text: event.body,
    attachments: event.attachments,
    status: 'received',
    externalId: event.externalMessageId,
    createdAt: event.timestamp,
  }
  conversation.messages.push(message)
  conversation.updatedAt = event.timestamp
  conversation.lastInboundAt = event.timestamp
  conversation.unread = (conversation.unread ?? 0) + 1
  if (conversation.status === 'resolved' || conversation.status === 'snoozed') setStatus(conversation, 'open')
  if (conversation.assigneeId === null) assignedByRoute = autoAssign(state, conversation) || assignedByRoute
  if (isNewConversation) queued.push(...runAutomations(state, 'conversation.created', conversation, message))
  if (assignedByRoute) queued.push(...runAutomations(state, 'conversation.assigned', conversation, message))
  channel.stats.inbound = (channel.stats.inbound ?? 0) + 1
  channel.stats.lastInboundAt = event.timestamp
  channel.runtime = {
    ...(channel.runtime ?? {}),
    health: 'connected',
    lastCheckedAt: nowIso(),
    lastError: '',
  }
  state.events.push({ id: makeId('evt'), type: 'message.received', text: `${contact.name} sent a message`, conversationId: conversation.id, channelId: channel.id, actorId: null, createdAt: event.timestamp })
  queued.push(...runAutomations(state, 'message.received', conversation, message))
  return { duplicate: false, conversationId: conversation.id, messageId: message.id, queued }
}

/**
 * Deliver one outbound message through the channel's native adapter.
 * Paused channels fail fast without touching the provider.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} channel - channel.
 * @param {Record<string, any>} conversation - conversation.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<{ok:boolean, error:string, externalId?:string}>} delivery result.
 */
async function postOutbound(state, channel, conversation, message) {
  if (channel.status !== 'active') return { ok: false, error: 'This channel is paused.' }
  try {
    return await sendOutbound(state, channel, conversation, message)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Deliver one previously queued outbound message and update its status.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} message - message.
 * @returns {Promise<boolean>} whether delivery succeeded.
 */
async function deliverOne(state, message) {
  const conversation = state.conversations.find((item) => item.messages.includes(message))
  if (conversation === undefined) return false
  const channel = state.channels.find((item) => item.id === conversation.channelId)
  if (channel === undefined) {
    message.status = 'failed'
    message.error = 'The channel no longer exists.'
    return false
  }
  message.status = 'sending'
  const result = await postOutbound(state, channel, conversation, message)
  if (result.ok) {
    message.status = 'sent'
    message.error = ''
    channel.stats.outbound = (channel.stats.outbound ?? 0) + 1
    channel.stats.lastOutboundAt = nowIso()
    channel.stats.lastError = ''
    conversation.lastOutboundAt = nowIso()
    state.events.push({ id: makeId('evt'), type: 'message.sent', text: 'Outbound message delivered', conversationId: conversation.id, channelId: channel.id, actorId: message.agentId ?? null, createdAt: nowIso() })
  } else {
    message.status = 'failed'
    message.error = result.error
    channel.stats.lastError = result.error
    state.events.push({ id: makeId('evt'), type: 'message.failed', text: `Outbound delivery failed: ${result.error}`, conversationId: conversation.id, channelId: channel.id, actorId: message.agentId ?? null, createdAt: nowIso() })
  }
  conversation.updatedAt = nowIso()
  return result.ok
}

/**
 * Deliver queued/retrying messages by id, committing after each one.
 * @param {Record<string, any>} store - store.
 * @param {string[]} ids - message ids.
 * @returns {Promise<void>}
 */
export async function deliverMessages(store, ids) {
  for (const id of ids) {
    const message = store.state.conversations.flatMap((conversation) => conversation.messages).find((item) => item.id === id)
    if (message === undefined || (message.status !== 'queued' && message.status !== 'failed' && message.status !== 'sending')) continue
    await deliverOne(store.state, message)
    await store.commit()
  }
}

/**
 * Queue background delivery without blocking the command response.
 * @param {Record<string, any>} runtime - store + serial executor.
 * @param {string[]} ids - message ids.
 * @returns {void}
 */
function scheduleDelivery(runtime, ids) {
  if (ids.length === 0) return
  runtime.serial(async () => {
    try {
      await deliverMessages(runtime.store, ids)
    } catch (error) {
      console.error('[im-omni] queued delivery failed:', error)
    }
  })
}

/**
 * Deliver one broadcast to its audience.
 * @param {Record<string, any>} store - store.
 * @param {Record<string, any>} broadcast - broadcast.
 * @returns {Promise<void>}
 */
async function sendBroadcast(store, broadcast) {
  const state = store.state
  if (broadcast.status === 'sending') throw new ApiError(409, 'broadcast-sending', 'This broadcast is already sending.')
  const channel = channelOf(state, broadcast.channelId)
  const audience = state.contacts.filter((contact) => {
    if (broadcast.audienceTag !== '' && !contact.tags.includes(broadcast.audienceTag)) return false
    return (contact.identities ?? []).some((identity) => identity.channelId === channel.id)
  })
  if (audience.length > MAX_BROADCAST_RECIPIENTS) {
    throw new ApiError(413, 'audience-too-large', `A broadcast can target at most ${MAX_BROADCAST_RECIPIENTS} contacts.`)
  }
  const currentAgent = actingAgent(state, {})
  const queued = []
  for (const contact of audience) {
    let conversation = state.conversations
      .filter((item) => item.channelId === channel.id && item.contactId === contact.id)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]
    if (conversation === undefined) {
      conversation = {
        id: makeId('cnv'),
        channelId: channel.id,
        contactId: contact.id,
        subject: broadcast.name,
        status: 'open',
        priority: 'normal',
        assigneeId: currentAgent,
        tags: ['broadcast'],
        unread: 0,
        externalId: (contact.identities ?? []).find((identity) => identity.channelId === channel.id)?.externalId
          ?? `broadcast_${contact.id}_${Date.now()}`,
        replyContext: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastInboundAt: null,
        lastOutboundAt: null,
        firstResponseAt: null,
        resolvedAt: null,
        snoozedUntil: null,
        messages: [],
      }
      state.conversations.push(conversation)
    }
    const body = renderTemplate(broadcast.body, state, conversation, contact, findAgent(state, currentAgent))
    const message = appendOutbound(state, conversation, body, { agentId: currentAgent, broadcastId: broadcast.id, firstResponse: false })
    queued.push({ message, conversation })
  }
  broadcast.status = 'sending'
  broadcast.stats = { targeted: audience.length, sent: 0, failed: 0 }
  broadcast.error = ''
  await store.commit()

  const results = []
  const concurrency = 6
  let cursor = 0
  async function worker() {
    while (cursor < queued.length) {
      const index = cursor
      cursor += 1
      const entry = queued[index]
      const result = await postOutbound(state, channel, entry.conversation, entry.message)
      results[index] = result
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queued.length) }, () => worker()))
  for (let index = 0; index < queued.length; index += 1) {
    const { message, conversation } = queued[index]
    const result = results[index]
    if (result?.ok) {
      message.status = 'sent'
      message.error = ''
      broadcast.stats.sent += 1
      channel.stats.outbound = (channel.stats.outbound ?? 0) + 1
      channel.stats.lastOutboundAt = nowIso()
      conversation.lastOutboundAt = nowIso()
    } else {
      message.status = 'failed'
      message.error = result?.error ?? 'Delivery failed.'
      broadcast.stats.failed += 1
      channel.stats.lastError = message.error
    }
    conversation.updatedAt = nowIso()
  }
  broadcast.status = broadcast.stats.sent > 0 || broadcast.stats.targeted === 0 ? 'sent' : 'failed'
  broadcast.sentAt = nowIso()
  if (broadcast.stats.failed > 0) broadcast.error = `${broadcast.stats.failed} of ${broadcast.stats.targeted} deliveries failed.`
}

/**
 * Send a broadcast and commit both the pre-delivery and final snapshot.
 * @param {Record<string, any>} store - store.
 * @param {Record<string, any>} broadcast - broadcast.
 * @returns {Promise<void>}
 */
async function sendBroadcastWithStore(store, broadcast) {
  await sendBroadcast(store, broadcast)
  await store.commit()
}

/**
 * Validate and create/update a channel payload.
 * @param {Record<string, any>} channel - target channel.
 * @param {Record<string, any>} payload - payload.
 * @returns {void}
 */
function applyChannel(channel, payload) {
  if (payload.name !== undefined) {
    const name = text(payload.name, 80)
    if (name === '') throw new ApiError(400, 'invalid-name', 'A channel name is required.')
    channel.name = name
  }
  if (payload.description !== undefined) channel.description = text(payload.description, 500)
  if (payload.type !== undefined && payload.type !== channel.type) {
    throw new ApiError(409, 'channel-type-immutable', 'Create a new channel to change its platform.')
  }
  if (payload.config !== undefined) {
    channel.config = normalizeConfig(channel.type, object(payload.config), channel.config ?? {})
  }
  if (payload.outboundUrl !== undefined && channel.type === 'webhook') {
    const value = outboundUrl(payload.outboundUrl)
    channel.outboundUrl = value
    channel.config = normalizeConfig(channel.type, { ...(channel.config ?? {}), outboundUrl: value }, channel.config ?? {})
  }
  if (payload.status !== undefined) channel.status = oneOf(payload.status, ['active', 'paused'], channel.status)
  channel.runtime = {
    ...(channel.runtime ?? {}),
    health: 'ready',
    lastError: '',
    lastCheckedAt: channel.runtime?.lastCheckedAt ?? null,
  }
  channel.updatedAt = nowIso()
}

/**
 * Apply a broadcast form payload.
 * @param {Record<string, any>} state - state.
 * @param {Record<string, any>} broadcast - target broadcast.
 * @param {Record<string, any>} payload - payload.
 * @returns {void}
 */
function applyBroadcast(state, broadcast, payload) {
  if (payload.name !== undefined) {
    const name = text(payload.name, 120)
    if (name === '') throw new ApiError(400, 'invalid-name', 'A broadcast name is required.')
    broadcast.name = name
  }
  if (payload.channelId !== undefined) broadcast.channelId = channelOf(state, payload.channelId).id
  if (payload.body !== undefined) {
    const body = text(payload.body, 8000)
    if (body === '') throw new ApiError(400, 'empty-body', 'A broadcast body is required.')
    broadcast.body = body
  }
  if (payload.audienceTag !== undefined) broadcast.audienceTag = text(payload.audienceTag, 40)
  if (payload.scheduledAt !== undefined) broadcast.scheduledAt = timestamp(payload.scheduledAt, true)
}

/**
 * Execute one command against the store.
 * @param {{store: Record<string, any>, serial: (task:() => Promise<unknown>) => Promise<unknown>}} runtime - command runtime.
 * @param {string} action - command action.
 * @param {unknown} rawPayload - raw payload.
 * @returns {Promise<{result: Record<string, any>}>} receipt.
 */
export async function executeCommand(runtime, action, rawPayload) {
  const { store } = runtime
  const state = store.state
  const payload = object(rawPayload ?? {})
  const queued = []

  switch (action) {
    case 'message.send': {
      const conversation = conversationOf(state, payload.conversationId)
      const body = text(payload.text, 8000)
      const attachments = await resolveAttachments(payload.attachments)
      if (body === '' && attachments.length === 0) {
        throw new ApiError(400, 'empty-message', 'Message text or at least one attachment is required.')
      }
      const agentId = actingAgent(state, payload)
      const templateId = typeof payload.templateId === 'string' ? payload.templateId : null
      const message = appendOutbound(state, conversation, body, { agentId, templateId, attachments })
      if (state.workspace.bot?.enabled === true) conversation.botPaused = true
      store.event('message.sent', 'Outbound message queued', { conversationId: conversation.id, channelId: conversation.channelId, actorId: agentId })
      queued.push(message.id)
      await store.commit()
      scheduleDelivery(runtime, queued)
      return { result: { messageId: message.id, queued: true } }
    }

    case 'message.note': {
      const conversation = conversationOf(state, payload.conversationId)
      const body = text(payload.text, 8000)
      if (body === '') throw new ApiError(400, 'empty-note', 'Note text is required.')
      const agentId = actingAgent(state, payload)
      const message = appendNote(state, conversation, body, agentId)
      await store.commit()
      return { result: { messageId: message.id } }
    }

    case 'message.retry': {
      const message = state.conversations.flatMap((conversation) => conversation.messages).find((item) => item.id === payload.messageId)
      if (message === undefined) throw new ApiError(404, 'message-not-found', 'Message not found.')
      if (message.direction !== 'out') throw new ApiError(409, 'not-outbound', 'Only outbound messages can be retried.')
      message.status = 'queued'
      message.error = ''
      await store.commit()
      scheduleDelivery(runtime, [message.id])
      return { result: { messageId: message.id, queued: true } }
    }

    case 'conversation.read': {
      const conversation = conversationOf(state, payload.conversationId)
      conversation.unread = 0
      await store.commit()
      return { result: {} }
    }

    case 'conversation.update': {
      const conversation = conversationOf(state, payload.conversationId)
      if (payload.status !== undefined) setStatus(conversation, oneOf(payload.status, STATUSES, conversation.status), timestamp(payload.snoozedUntil, true))
      if (payload.priority !== undefined) conversation.priority = oneOf(payload.priority, PRIORITIES, conversation.priority)
      if (payload.assigneeId !== undefined) {
        if (payload.assigneeId === null || payload.assigneeId === '') {
          conversation.assigneeId = null
        } else {
          const agent = findAgent(state, payload.assigneeId)
          if (agent === undefined) throw new ApiError(404, 'agent-not-found', 'Agent not found.')
          conversation.assigneeId = agent.id
        }
      }
      if (payload.tags !== undefined) conversation.tags = tags(payload.tags)
      if (payload.subject !== undefined) {
        const subject = text(payload.subject, 160)
        if (subject !== '') conversation.subject = subject
      }
      if (payload.snoozeMinutes !== undefined) {
        const minutes = integer(payload.snoozeMinutes, 60, 1, 60 * 24 * 30)
        setStatus(conversation, 'snoozed', new Date(Date.now() + minutes * 60_000).toISOString())
      }
      conversation.updatedAt = nowIso()
      store.event('conversation.updated', 'Conversation updated', { conversationId: conversation.id, channelId: conversation.channelId, actorId: actingAgent(state, payload) })
      await store.commit()
      return { result: {} }
    }

    case 'conversation.create': {
      const contact = contactOf(state, payload.contactId)
      const channel = channelOf(state, payload.channelId)
      const conversation = {
        id: makeId('cnv'),
        channelId: channel.id,
        contactId: contact.id,
        subject: text(payload.subject, 160) || `Conversation with ${contact.name}`,
        status: 'open',
        priority: oneOf(payload.priority, PRIORITIES, 'normal'),
        assigneeId: findAgent(state, payload.assigneeId)?.id ?? actingAgent(state, payload),
        tags: tags(payload.tags),
        unread: 0,
        externalId: `manual_${makeId('ext')}`,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastInboundAt: null,
        lastOutboundAt: null,
        firstResponseAt: null,
        resolvedAt: null,
        snoozedUntil: null,
        messages: [],
      }
      state.conversations.push(conversation)
      store.event('conversation.created', `Conversation created for ${contact.name}`, { conversationId: conversation.id, channelId: channel.id, actorId: actingAgent(state, payload) })
      const body = text(payload.text, 8000)
      if (body !== '') {
        const message = appendOutbound(state, conversation, body, { agentId: actingAgent(state, payload) })
        queued.push(message.id)
      }
      await store.commit()
      scheduleDelivery(runtime, queued)
      return { result: { conversationId: conversation.id } }
    }

    case 'contact.create': {
      const name = text(payload.name, 120)
      if (name === '') throw new ApiError(400, 'invalid-name', 'A contact name is required.')
      const contact = {
        id: makeId('ct'),
        name,
        handle: text(payload.handle, 120),
        email: text(payload.email, 200),
        phone: text(payload.phone, 80),
        company: text(payload.company, 120),
        hue: integer(payload.hue, Math.floor(Math.random() * 360), 0, 360),
        tags: tags(payload.tags),
        attributes: {},
        identities: [],
        createdAt: nowIso(),
        lastSeenAt: null,
        notes: [],
      }
      state.contacts.push(contact)
      store.event('contact.created', `Contact "${contact.name}" created`, { actorId: actingAgent(state, payload) })
      await store.commit()
      return { result: { contactId: contact.id } }
    }

    case 'contact.update': {
      const contact = contactOf(state, payload.contactId)
      if (payload.name !== undefined) {
        const name = text(payload.name, 120)
        if (name === '') throw new ApiError(400, 'invalid-name', 'A contact name is required.')
        contact.name = name
      }
      for (const field of ['handle', 'email', 'phone', 'company']) {
        if (payload[field] !== undefined) contact[field] = text(payload[field], field === 'email' ? 200 : 120)
      }
      if (payload.tags !== undefined) contact.tags = tags(payload.tags)
      if (payload.hue !== undefined) contact.hue = integer(payload.hue, contact.hue ?? 210, 0, 360)
      await store.commit()
      return { result: {} }
    }

    case 'contact.delete': {
      const contact = contactOf(state, payload.contactId)
      if (state.conversations.some((conversation) => conversation.contactId === contact.id)) {
        throw new ApiError(409, 'contact-in-use', 'This contact still has conversations. Resolve or delete them first.')
      }
      state.contacts = state.contacts.filter((item) => item.id !== contact.id)
      await store.commit()
      return { result: {} }
    }

    case 'conversation.bot': {
      const conversation = conversationOf(state, payload.conversationId)
      conversation.botPaused = payload.paused === undefined ? !(conversation.botPaused === true) : Boolean(payload.paused)
      conversation.updatedAt = nowIso()
      store.event('conversation.bot', conversation.botPaused ? 'Bot paused; human takeover' : 'Bot resumed', {
        conversationId: conversation.id,
        channelId: conversation.channelId,
        actorId: actingAgent(state, payload),
      })
      await store.commit()
      return { result: { paused: conversation.botPaused === true } }
    }

    case 'contact.note': {
      const contact = contactOf(state, payload.contactId)
      const body = text(payload.text, 4000)
      if (body === '') throw new ApiError(400, 'empty-note', 'Note text is required.')
      contact.notes.push({ id: makeId('note'), body, authorId: actingAgent(state, payload), createdAt: nowIso() })
      await store.commit()
      return { result: {} }
    }

    case 'channel.create': {
      const name = text(payload.name, 80)
      if (name === '') throw new ApiError(400, 'invalid-name', 'A channel name is required.')
      const type = requireType(payload.type)
      const config = normalizeConfig(type, object(payload.config ?? { outboundUrl: payload.outboundUrl }))
      const channel = {
        id: makeId('chn'),
        name,
        description: text(payload.description, 500),
        type,
        status: oneOf(payload.status, ['active', 'paused'], 'active'),
        outboundUrl: type === 'webhook' ? config.outboundUrl ?? '' : '',
        config,
        secret: makeSecret(),
        runtime: { health: 'ready', lastCheckedAt: null, lastError: '', account: '', qrStatus: 'disconnected' },
        createdAt: nowIso(),
        updatedAt: nowIso(),
        stats: { inbound: 0, outbound: 0, lastInboundAt: null, lastOutboundAt: null, lastError: '' },
      }
      state.channels.push(channel)
      store.event('channel.created', `${type} channel "${channel.name}" created`, { channelId: channel.id, actorId: actingAgent(state, payload) })
      await store.commit()
      runtime.channels?.sync()
      return {
        result: {
          channelId: channel.id,
          name: channel.name,
          type,
          secret: channel.secret,
          secrets: revealSecrets(channel),
          channel: publicChannel(channel),
          webhookPath: `/api/im-omni.webhook/${channel.id}`,
        },
      }
    }

    case 'channel.update': {
      const channel = channelOf(state, payload.channelId)
      applyChannel(channel, payload)
      await store.commit()
      runtime.channels?.sync()
      return { result: { channelId: channel.id } }
    }

    case 'channel.delete': {
      const channel = channelOf(state, payload.channelId)
      if (state.conversations.some((conversation) => conversation.channelId === channel.id)) {
        throw new ApiError(409, 'channel-in-use', 'This channel still has conversations. Delete or archive them first.')
      }
      state.channels = state.channels.filter((item) => item.id !== channel.id)
      await store.commit()
      runtime.channels?.sync()
      return { result: {} }
    }

    case 'channel.rotateSecret': {
      const channel = channelOf(state, payload.channelId)
      channel.secret = makeSecret()
      if (channel.config?.bridgeToken !== undefined) {
        channel.config = normalizeConfig(channel.type, { ...(channel.config ?? {}), bridgeToken: makeSecret() }, channel.config)
      }
      channel.updatedAt = nowIso()
      await store.commit()
      return {
        result: {
          secret: channel.secret,
          bridgeToken: channel.config?.bridgeToken ?? '',
          secrets: revealSecrets(channel),
          fingerprint: secretFingerprint(channel.secret),
        },
      }
    }

    case 'channel.revealSecret': {
      const channel = channelOf(state, payload.channelId)
      return {
        result: {
          secret: channel.secret,
          secrets: revealSecrets(channel),
          fingerprint: secretFingerprint(channel.secret),
          webhookPath: `/api/im-omni.webhook/${channel.id}`,
        },
      }
    }

    case 'channel.test': {
      const channel = channelOf(state, payload.channelId)
      const result = await testChannel(channel, runtime)
      channel.runtime = {
        ...(channel.runtime ?? {}),
        health: result.ok ? 'connected' : 'error',
        lastCheckedAt: nowIso(),
        lastError: result.ok ? '' : result.detail,
        account: result.account ?? channel.runtime?.account ?? '',
      }
      channel.stats.lastError = result.ok ? '' : result.detail
      await store.commit()
      if (!result.ok) throw new ApiError(502, 'channel-test-failed', result.detail)
      return { result: { ok: true, detail: result.detail, account: result.account ?? '' } }
    }

    case 'channel.qr': {
      const channel = channelOf(state, payload.channelId)
      const result = await qrLogin(channel, runtime)
      channel.runtime = {
        ...(channel.runtime ?? {}),
        health: result.status === 'connected' ? 'connected' : 'ready',
        lastCheckedAt: nowIso(),
        lastError: result.ok ? '' : result.detail,
        account: result.account ?? channel.runtime?.account ?? '',
        qrStatus: result.status ?? 'disconnected',
      }
      await store.commit()
      return { result }
    }

    case 'channel.qrStatus': {
      const channel = channelOf(state, payload.channelId)
      const result = await qrStatus(channel, runtime)
      channel.runtime = {
        ...(channel.runtime ?? {}),
        health: result.status === 'connected' ? 'connected' : (result.ok ? 'ready' : 'error'),
        lastCheckedAt: nowIso(),
        lastError: result.ok ? '' : result.detail,
        account: result.account ?? channel.runtime?.account ?? '',
        qrStatus: result.status ?? 'disconnected',
      }
      await store.commit()
      return { result }
    }

    case 'template.create': {
      const name = text(payload.name, 120)
      const body = text(payload.body, 8000)
      if (name === '') throw new ApiError(400, 'invalid-name', 'A template name is required.')
      if (body === '') throw new ApiError(400, 'empty-body', 'Template body is required.')
      const template = {
        id: makeId('tpl'),
        name,
        shortcut: text(payload.shortcut, 40),
        body,
        channelIds: Array.isArray(payload.channelIds) ? payload.channelIds.filter((id) => state.channels.some((channel) => channel.id === id)) : [],
        locale: text(payload.locale, 20),
        usageCount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      state.templates.push(template)
      await store.commit()
      return { result: { templateId: template.id } }
    }

    case 'template.update': {
      const template = state.templates.find((item) => item.id === payload.templateId)
      if (template === undefined) throw new ApiError(404, 'template-not-found', 'Template not found.')
      if (payload.name !== undefined) {
        const name = text(payload.name, 120)
        if (name === '') throw new ApiError(400, 'invalid-name', 'A template name is required.')
        template.name = name
      }
      if (payload.body !== undefined) {
        const body = text(payload.body, 8000)
        if (body === '') throw new ApiError(400, 'empty-body', 'Template body is required.')
        template.body = body
      }
      if (payload.shortcut !== undefined) template.shortcut = text(payload.shortcut, 40)
      if (payload.channelIds !== undefined) template.channelIds = Array.isArray(payload.channelIds) ? payload.channelIds.filter((id) => state.channels.some((channel) => channel.id === id)) : []
      if (payload.locale !== undefined) template.locale = text(payload.locale, 20)
      template.updatedAt = nowIso()
      await store.commit()
      return { result: {} }
    }

    case 'template.delete': {
      state.templates = state.templates.filter((item) => item.id !== payload.templateId)
      await store.commit()
      return { result: {} }
    }

    case 'automation.create': {
      const name = text(payload.name, 120)
      if (name === '') throw new ApiError(400, 'invalid-name', 'An automation name is required.')
      const actions = Array.isArray(payload.actions)
        ? payload.actions.filter((action) => ACTION_TYPES.includes(action?.type)).slice(0, 10).map((action) => ({ type: action.type, value: text(action.value, 8000) }))
        : []
      if (actions.length === 0) throw new ApiError(400, 'empty-actions', 'At least one automation action is required.')
      const automation = {
        id: makeId('atm'),
        name,
        enabled: payload.enabled !== false,
        trigger: oneOf(payload.trigger, TRIGGERS, 'message.received'),
        conditions: {
          keyword: text(payload.keyword, 120),
          channelId: text(payload.channelId, 80),
          contactTag: text(payload.contactTag, 40),
          priority: oneOf(payload.priority, ['', ...PRIORITIES], ''),
        },
        actions,
        runCount: 0,
        lastRunAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      state.automations.push(automation)
      await store.commit()
      return { result: { automationId: automation.id } }
    }

    case 'automation.update': {
      const automation = state.automations.find((item) => item.id === payload.automationId)
      if (automation === undefined) throw new ApiError(404, 'automation-not-found', 'Automation not found.')
      if (payload.name !== undefined) {
        const name = text(payload.name, 120)
        if (name === '') throw new ApiError(400, 'invalid-name', 'An automation name is required.')
        automation.name = name
      }
      if (payload.enabled !== undefined) automation.enabled = Boolean(payload.enabled)
      if (payload.trigger !== undefined) automation.trigger = oneOf(payload.trigger, TRIGGERS, automation.trigger)
      automation.conditions = {
        ...automation.conditions,
        ...(payload.keyword !== undefined ? { keyword: text(payload.keyword, 120) } : {}),
        ...(payload.channelId !== undefined ? { channelId: text(payload.channelId, 80) } : {}),
        ...(payload.contactTag !== undefined ? { contactTag: text(payload.contactTag, 40) } : {}),
        ...(payload.priority !== undefined ? { priority: oneOf(payload.priority, ['', ...PRIORITIES], '') } : {}),
      }
      if (payload.actions !== undefined) {
        const actions = Array.isArray(payload.actions)
          ? payload.actions.filter((action) => ACTION_TYPES.includes(action?.type)).slice(0, 10).map((action) => ({ type: action.type, value: text(action.value, 8000) }))
          : []
        if (actions.length === 0) throw new ApiError(400, 'empty-actions', 'At least one automation action is required.')
        automation.actions = actions
      }
      automation.updatedAt = nowIso()
      await store.commit()
      return { result: {} }
    }

    case 'automation.delete': {
      state.automations = state.automations.filter((item) => item.id !== payload.automationId)
      await store.commit()
      return { result: {} }
    }

    case 'broadcast.create': {
      const name = text(payload.name, 120)
      if (name === '') throw new ApiError(400, 'invalid-name', 'A broadcast name is required.')
      const channel = channelOf(state, payload.channelId)
      const body = text(payload.body, 8000)
      if (body === '') throw new ApiError(400, 'empty-body', 'A broadcast body is required.')
      const broadcast = {
        id: makeId('brd'),
        name,
        channelId: channel.id,
        body,
        audienceTag: text(payload.audienceTag, 40),
        scheduledAt: timestamp(payload.scheduledAt, true),
        status: 'draft',
        stats: { targeted: 0, sent: 0, failed: 0 },
        createdAt: nowIso(),
        sentAt: null,
        error: '',
      }
      state.broadcasts.push(broadcast)
      await store.commit()
      return { result: { broadcastId: broadcast.id } }
    }

    case 'broadcast.update': {
      const broadcast = state.broadcasts.find((item) => item.id === payload.broadcastId)
      if (broadcast === undefined) throw new ApiError(404, 'broadcast-not-found', 'Broadcast not found.')
      if (broadcast.status === 'sending') throw new ApiError(409, 'broadcast-sending', 'A sending broadcast cannot be edited.')
      applyBroadcast(state, broadcast, payload)
      if (payload.status !== undefined) {
        const status = oneOf(payload.status, ['draft', 'scheduled', 'cancelled'], broadcast.status)
        broadcast.status = status
      }
      await store.commit()
      return { result: {} }
    }

    case 'broadcast.schedule': {
      const broadcast = state.broadcasts.find((item) => item.id === payload.broadcastId)
      if (broadcast === undefined) throw new ApiError(404, 'broadcast-not-found', 'Broadcast not found.')
      const scheduledAt = timestamp(payload.scheduledAt, false)
      broadcast.scheduledAt = scheduledAt
      broadcast.status = 'scheduled'
      broadcast.error = ''
      await store.commit()
      return { result: { scheduledAt } }
    }

    case 'broadcast.cancel': {
      const broadcast = state.broadcasts.find((item) => item.id === payload.broadcastId)
      if (broadcast === undefined) throw new ApiError(404, 'broadcast-not-found', 'Broadcast not found.')
      if (broadcast.status === 'sending') throw new ApiError(409, 'broadcast-sending', 'A sending broadcast cannot be cancelled.')
      broadcast.status = 'cancelled'
      await store.commit()
      return { result: {} }
    }

    case 'broadcast.send': {
      const broadcast = state.broadcasts.find((item) => item.id === payload.broadcastId)
      if (broadcast === undefined) throw new ApiError(404, 'broadcast-not-found', 'Broadcast not found.')
      if (broadcast.status === 'sending') throw new ApiError(409, 'broadcast-sending', 'This broadcast is already sending.')
      if (broadcast.status === 'sent') throw new ApiError(409, 'broadcast-sent', 'This broadcast was already sent.')
      await sendBroadcastWithStore(store, broadcast)
      return { result: { status: broadcast.status, stats: broadcast.stats } }
    }

    case 'broadcast.delete': {
      state.broadcasts = state.broadcasts.filter((item) => item.id !== payload.broadcastId)
      await store.commit()
      return { result: {} }
    }

    case 'agent.create': {
      const name = text(payload.name, 120)
      if (name === '') throw new ApiError(400, 'invalid-name', 'An agent name is required.')
      const agent = {
        id: makeId('agent'),
        name,
        email: text(payload.email, 200),
        role: oneOf(payload.role, ['admin', 'agent'], 'agent'),
        availability: oneOf(payload.availability, AVAILABILITIES, 'offline'),
        hue: integer(payload.hue, Math.floor(Math.random() * 360), 0, 360),
        createdAt: nowIso(),
      }
      state.agents.push(agent)
      if (state.workspace.currentAgentId === null) state.workspace.currentAgentId = agent.id
      await store.commit()
      return { result: { agentId: agent.id } }
    }

    case 'agent.update': {
      const agent = findAgent(state, payload.agentId)
      if (agent === undefined) throw new ApiError(404, 'agent-not-found', 'Agent not found.')
      if (payload.name !== undefined) {
        const name = text(payload.name, 120)
        if (name === '') throw new ApiError(400, 'invalid-name', 'An agent name is required.')
        agent.name = name
      }
      if (payload.email !== undefined) agent.email = text(payload.email, 200)
      if (payload.role !== undefined) agent.role = oneOf(payload.role, ['admin', 'agent'], agent.role)
      if (payload.availability !== undefined) agent.availability = oneOf(payload.availability, AVAILABILITIES, agent.availability)
      if (payload.hue !== undefined) agent.hue = integer(payload.hue, agent.hue ?? 210, 0, 360)
      await store.commit()
      return { result: {} }
    }

    case 'agent.delete': {
      const agent = findAgent(state, payload.agentId)
      if (agent === undefined) throw new ApiError(404, 'agent-not-found', 'Agent not found.')
      if (state.conversations.some((conversation) => conversation.assigneeId === agent.id)) {
        throw new ApiError(409, 'agent-in-use', 'Reassign this agent\'s conversations first.')
      }
      if (state.workspace.currentAgentId === agent.id) {
        throw new ApiError(409, 'agent-current', 'Switch the current agent before deleting this teammate.')
      }
      state.agents = state.agents.filter((item) => item.id !== agent.id)
      await store.commit()
      return { result: {} }
    }

    case 'settings.update': {
      if (payload.name !== undefined) {
        const name = text(payload.name, 120)
        if (name === '') throw new ApiError(400, 'invalid-name', 'A workspace name is required.')
        state.workspace.name = name
      }
      if (payload.timezone !== undefined) state.workspace.timezone = text(payload.timezone, 80)
      if (payload.autoAssign !== undefined) state.workspace.autoAssign = Boolean(payload.autoAssign)
      if (payload.autoTranslate !== undefined) state.workspace.autoTranslate = Boolean(payload.autoTranslate)
      if (payload.aiSuggestions !== undefined) state.workspace.aiSuggestions = Boolean(payload.aiSuggestions)
      if (payload.translationTarget !== undefined) state.workspace.translationTarget = text(payload.translationTarget, 40) || 'zh-CN'
      if (payload.bot !== undefined && payload.bot !== null && typeof payload.bot === 'object' && !Array.isArray(payload.bot)) {
        const bot = payload.bot
        if (bot.enabled !== undefined) state.workspace.bot.enabled = Boolean(bot.enabled)
        if (bot.name !== undefined) state.workspace.bot.name = text(bot.name, 80) || 'AI 接待'
        if (bot.greeting !== undefined) state.workspace.bot.greeting = text(bot.greeting, 1000)
        if (bot.instructions !== undefined) state.workspace.bot.instructions = text(bot.instructions, 4000)
        if (bot.handoffKeywords !== undefined) state.workspace.bot.handoffKeywords = text(bot.handoffKeywords, 500)
        if (bot.maxTurns !== undefined) state.workspace.bot.maxTurns = integer(bot.maxTurns, 12, 1, 100)
      }
      if (payload.defaultSlaMinutes !== undefined) state.workspace.defaultSlaMinutes = integer(payload.defaultSlaMinutes, 30, 1, 1440)
      if (payload.currentAgentId !== undefined) {
        if (payload.currentAgentId === null || payload.currentAgentId === '') state.workspace.currentAgentId = null
        else {
          const agent = findAgent(state, payload.currentAgentId)
          if (agent === undefined) throw new ApiError(404, 'agent-not-found', 'Agent not found.')
          state.workspace.currentAgentId = agent.id
        }
      }
      if (payload.businessHours !== undefined && payload.businessHours !== null && typeof payload.businessHours === 'object') {
        const start = text(payload.businessHours.start, 5)
        const end = text(payload.businessHours.end, 5)
        if (/^\d{2}:\d{2}$/.test(start)) state.workspace.businessHours.start = start
        if (/^\d{2}:\d{2}$/.test(end)) state.workspace.businessHours.end = end
        if (Array.isArray(payload.businessHours.days)) {
          state.workspace.businessHours.days = payload.businessHours.days
            .map((day) => integer(day, 0, 0, 6))
            .filter((day, index, list) => day >= 0 && list.indexOf(day) === index)
        }
      }
      await store.commit()
      return { result: {} }
    }

    case 'demo.exit': {
      await store.exitDemo()
      return { result: {} }
    }

    case 'demo.reset': {
      await store.resetDemo()
      return { result: {} }
    }

    case 'demo.clear': {
      await store.clearAll()
      return { result: {} }
    }

    default:
      throw new ApiError(404, 'unknown-action', `Unknown command "${action}".`)
  }
}

/**
 * Persist that the bot has claimed one inbound message, so a redelivery does
 * not cause a second autonomous reply.
 * @param {Record<string, any>} runtime - runtime.
 * @param {string} conversationId - conversation.
 * @param {string} messageId - inbound message.
 * @returns {Promise<void>} completion.
 */
export async function markBotHandled(runtime, conversationId, messageId) {
  await runtime.serial(async () => {
    const conversation = runtime.store.state.conversations.find((item) => item.id === conversationId)
    if (conversation === undefined) return
    const message = conversation.messages.find((item) => item.id === messageId)
    if (message !== undefined) message.botHandled = true
    await runtime.store.commit()
  })
}

/**
 * Append and queue one bot-authored reply.
 * @param {Record<string, any>} runtime - runtime.
 * @param {string} conversationId - conversation.
 * @param {string} body - reply text.
 * @param {string} model - model label for the UI.
 * @returns {Promise<string>} message id.
 */
export async function replyAsBot(runtime, conversationId, body, model = '') {
  return runtime.serial(async () => {
    const state = runtime.store.state
    const conversation = conversationOf(state, conversationId)
    const channel = channelOf(state, conversation.channelId)
    if (channel.status !== 'active' || conversation.botPaused === true) return ''
    const message = appendOutbound(state, conversation, body, { sender: 'bot', agentId: null })
    message.model = text(model, 120)
    conversation.botTurns = (Number(conversation.botTurns) || 0) + 1
    conversation.botLastReplyAt = message.createdAt
    conversation.updatedAt = message.createdAt
    state.events.push({ id: makeId('evt'), type: 'bot.replied', text: 'AI reception replied', conversationId: conversation.id, channelId: channel.id, actorId: null, createdAt: message.createdAt })
    await storeCommit(runtime)
    scheduleDelivery(runtime, [message.id])
    return message.id
  })
}

/**
 * Stop the bot on a conversation and hand it to a human queue.
 * @param {Record<string, any>} runtime - runtime.
 * @param {string} conversationId - conversation.
 * @param {string} reason - handoff reason.
 * @returns {Promise<void>} completion.
 */
export async function handoffBot(runtime, conversationId, reason) {
  await runtime.serial(async () => {
    const state = runtime.store.state
    const conversation = state.conversations.find((item) => item.id === conversationId)
    if (conversation === undefined) return
    conversation.botPaused = true
    conversation.botHandoffReason = text(reason, 500)
    if (conversation.status === 'open') conversation.status = 'pending'
    conversation.updatedAt = nowIso()
    state.events.push({ id: makeId('evt'), type: 'bot.handoff', text: `AI handoff: ${conversation.botHandoffReason || 'human review'}`, conversationId: conversation.id, channelId: conversation.channelId, actorId: null, createdAt: nowIso() })
    await storeCommit(runtime)
  })
}

/**
 * Commit through the runtime store.
 * @param {Record<string, any>} runtime - runtime.
 * @returns {Promise<void>} completion.
 */
async function storeCommit(runtime) {
  await runtime.store.commit()
}

/**
 * Handle one inbound bridge payload after authentication.
 * @param {{store: Record<string, any>, serial: (task:() => Promise<unknown>) => Promise<unknown>}} runtime - runtime.
 * @param {string} channelId - channel id.
 * @param {Record<string, any>} payload - parsed body.
 * @returns {Promise<Record<string, any>>} bridge receipt.
 */
export async function handleInbound(runtime, channelId, payload) {
  const { store } = runtime
  const channel = store.state.channels.find((item) => item.id === channelId)
  if (channel === undefined) throw new ApiError(404, 'channel-not-found', 'Channel not found.')
  const outcome = await runtime.serial(async () => {
    const receipt = ingestInbound(store.state, channel, payload)
    await store.commit()
    return receipt
  })
  const receipt = /** @type {Record<string, any>} */ (outcome)
  // Provider media handles and private URLs are not renderable on their own:
  // download the bytes after the webhook is acknowledged, then let the message
  // carry an ordinary attachment descriptor. Failures stay non-fatal.
  if (receipt.duplicate !== true && typeof receipt.messageId === 'string' && receipt.messageId !== '') {
    void persistInboundMedia(runtime, receipt.messageId).catch((error) => {
      runtime.logger?.warn?.(`im-omni：入站附件转存失败：${error instanceof Error ? error.message : String(error)}`)
    })
  }
  if (Array.isArray(receipt.queued) && receipt.queued.length > 0) {
    scheduleDelivery(runtime, receipt.queued)
  }
  if (receipt.duplicate !== true && receipt.conversationId !== null) {
    runtime.bot?.onInbound(receipt.conversationId)
  }
  return receipt
}

/**
 * Run due scheduled broadcasts. Called by the plugin's short interval.
 * @param {{store: Record<string, any>, serial: (task:() => Promise<unknown>) => Promise<unknown>}} runtime - runtime.
 * @returns {Promise<void>}
 */
export async function processDueBroadcasts(runtime) {
  const due = runtime.store.state.broadcasts.filter((broadcast) =>
    broadcast.status === 'scheduled'
    && broadcast.scheduledAt !== null
    && Date.parse(broadcast.scheduledAt) <= Date.now())
  for (const scheduled of due) {
    await runtime.serial(async () => {
      const broadcast = runtime.store.state.broadcasts.find((item) => item.id === scheduled.id)
      if (broadcast === undefined || broadcast.status !== 'scheduled') return
      try {
        await sendBroadcastWithStore(runtime.store, broadcast)
      } catch (error) {
        broadcast.status = 'failed'
        broadcast.error = error instanceof Error ? error.message : String(error)
        await runtime.store.commit()
      }
    })
  }
}

/**
 * Verify a bridge request against a channel secret using either the token or
 * an HMAC signature header.
 * @param {Record<string, any>} channel - channel.
 * @param {{token:string, signature:string, rawBody:string}} supplied - auth material.
 * @returns {boolean} whether authentication succeeds.
 */
export function authenticateBridge(channel, supplied) {
  if (equalSecret(supplied.token, channel.secret)) return true
  if (supplied.signature === '' || supplied.rawBody === '') return false
  return equalSecret(supplied.signature, signBody(channel.secret, supplied.rawBody))
}
