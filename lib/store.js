/**
 * Durable state for the IM omnichannel plugin.
 *
 * One JSON document is owned by the plugin and published atomically after
 * every command. The document contains no Session events and no model-visible
 * payloads; it is ordinary Host-side plugin state.
 * @module dsh-im-omni/lib/store
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { clone, makeId, nowIso } from './util.js'
import { seedState } from './seed.js'
import { publicCatalog } from './channels/catalog.js'
import { publicChannel } from './channels/index.js'

/** Current data version. */
const DATA_VERSION = 1

/** Days retained by the volume chart. */
const VOLUME_DAYS = 14

/**
 * Resolve the plugin data file without writing into the Harness package tree.
 * @returns {string} absolute state path.
 */
export function defaultStatePath() {
  if (process.env.DSH_PROFILE_DIR) {
    return path.join(process.env.DSH_PROFILE_DIR, '.im-omni', 'state.json')
  }
  const base = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE || 'default'
  return path.join(base, 'im-omni', profile, 'state.json')
}

/**
 * UTC day key.
 * @param {string} iso - ISO timestamp.
 * @returns {string} YYYY-MM-DD.
 */
function dayKey(iso) {
  return iso.slice(0, 10)
}

/**
 * A local empty workspace with no demo records.
 * @param {Record<string, any>} workspace - workspace settings to retain.
 * @returns {Record<string, any>} empty state.
 */
export function emptyState(workspace) {
  return {
    version: DATA_VERSION,
    demo: false,
    workspace: {
      name: 'Support workspace',
      timezone: 'UTC',
      businessHours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] },
      autoAssign: true,
      defaultSlaMinutes: 30,
      autoTranslate: true,
      translationTarget: 'zh-CN',
      aiSuggestions: true,
      bot: {
        enabled: false,
        name: 'AI 接待',
        greeting: '',
        instructions: '',
        handoffKeywords: '人工,转人工,投诉,退款,human,agent',
        maxTurns: 12,
      },
      notify: {
        enabled: false,
        wecomWebhook: '',
        quietStart: '',
        quietEnd: '',
        privatePreview: false,
        linkTemplate: '',
      },
      currentAgentId: null,
      ...workspace,
    },
    agents: [],
    channels: [],
    contacts: [],
    conversations: [],
    templates: [],
    automations: [],
    broadcasts: [],
    events: [],
    meta: { revision: 1, createdAt: nowIso(), updatedAt: nowIso() },
  }
}

/**
 * Fill collections omitted by an older or hand-edited document.
 * @param {Record<string, any>} state - stored state.
 * @returns {Record<string, any>} normalized state.
 */
function normalizeState(state) {
  const base = emptyState({})
  return {
    ...base,
    ...state,
    version: DATA_VERSION,
    workspace: {
      ...base.workspace,
      ...(state.workspace ?? {}),
      bot: { ...base.workspace.bot, ...(state.workspace?.bot ?? {}) },
      notify: { ...base.workspace.notify, ...(state.workspace?.notify ?? {}) },
    },
    agents: Array.isArray(state.agents) ? state.agents : [],
    channels: Array.isArray(state.channels)
      ? state.channels.map((channel) => ({
        ...channel,
        type: typeof channel.type === 'string' && channel.type !== '' ? channel.type : 'webhook',
        config: channel.config !== null && typeof channel.config === 'object' ? channel.config : {
          outboundUrl: typeof channel.outboundUrl === 'string' ? channel.outboundUrl : '',
        },
        runtime: {
          lastCheckedAt: null,
          lastError: '',
          account: '',
          qrStatus: 'disconnected',
          ...(channel.runtime ?? {}),
          health: channel.runtime?.health === 'error' || channel.runtime?.health === 'connected'
            ? channel.runtime.health
            : ((channel.stats?.inbound ?? 0) > 0 ? 'connected' : 'ready'),
        },
      }))
      : [],
    contacts: Array.isArray(state.contacts)
      ? state.contacts.map((contact) => ({
        ...contact,
        handle: typeof contact.handle === 'string' && contact.handle.endsWith('@lid') ? '' : contact.handle,
        phone: typeof contact.phone === 'string' && contact.phone.endsWith('@lid') ? '' : contact.phone,
      }))
      : [],
    conversations: Array.isArray(state.conversations) ? state.conversations : [],
    templates: Array.isArray(state.templates) ? state.templates : [],
    automations: Array.isArray(state.automations) ? state.automations : [],
    broadcasts: Array.isArray(state.broadcasts) ? state.broadcasts : [],
    events: Array.isArray(state.events) ? state.events : [],
    meta: {
      ...base.meta,
      ...(state.meta ?? {}),
      revision: Number.isFinite(state.meta?.revision) ? state.meta.revision : 1,
    },
  }
}

/**
 * Compute all aggregates shown by the dashboard and analytics page.
 * @param {Record<string, any>} state - current state.
 * @returns {Record<string, any>} analytics snapshot.
 */
export function deriveAnalytics(state) {
  const now = Date.now()
  const slaMs = Math.max(1, Number(state.workspace.defaultSlaMinutes) || 30) * 60_000
  const today = new Date(now).toISOString().slice(0, 10)
  const conversations = state.conversations
  const messages = conversations.flatMap((conversation) =>
    conversation.messages.map((message) => ({ ...message, conversation, channelId: conversation.channelId })))
  const customerMessages = messages.filter((message) => message.direction === 'in' || message.direction === 'out')
  const openConversations = conversations.filter((conversation) => conversation.status !== 'resolved')
  const awaiting = openConversations.filter((conversation) => {
    const lastIn = conversation.lastInboundAt === null ? 0 : Date.parse(conversation.lastInboundAt)
    const lastOut = conversation.lastOutboundAt === null ? 0 : Date.parse(conversation.lastOutboundAt)
    return lastIn > lastOut
  })
  const breached = openConversations.filter((conversation) => {
    if (typeof conversation.firstResponseAt === 'string') return false
    const firstInbound = conversation.messages.find((message) => message.direction === 'in')
    if (firstInbound === undefined) return false
    return now - Date.parse(firstInbound.createdAt) > slaMs
  })
  const firstResponses = conversations
    .filter((conversation) => typeof conversation.firstResponseAt === 'string')
    .map((conversation) => {
      const firstIn = conversation.messages.find((message) => message.direction === 'in')
      if (firstIn === undefined) return null
      const seconds = (Date.parse(conversation.firstResponseAt) - Date.parse(firstIn.createdAt)) / 1000
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
    })
    .filter((value) => value !== null)
  const resolutions = conversations
    .filter((conversation) => typeof conversation.resolvedAt === 'string')
    .map((conversation) => {
      const firstIn = conversation.messages.find((message) => message.direction === 'in')
      if (firstIn === undefined || typeof conversation.resolvedAt !== 'string') return null
      const seconds = (Date.parse(conversation.resolvedAt) - Date.parse(firstIn.createdAt)) / 1000
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
    })
    .filter((value) => value !== null)

  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - (VOLUME_DAYS - 1))
  const days = Array.from({ length: VOLUME_DAYS }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000)
    const key = date.toISOString().slice(0, 10)
    return { date: key, inbound: 0, outbound: 0, total: 0 }
  })
  const byDay = new Map(days.map((day) => [day.date, day]))
  for (const message of customerMessages) {
    const bucket = byDay.get(dayKey(message.createdAt))
    if (bucket === undefined) continue
    if (message.direction === 'in') bucket.inbound += 1
    else bucket.outbound += 1
    bucket.total += 1
  }

  const channelStats = state.channels.map((channel) => {
    const channelConversations = conversations.filter((conversation) => conversation.channelId === channel.id)
    const channelMessages = customerMessages.filter((message) => message.channelId === channel.id)
    return {
      id: channel.id,
      name: channel.name,
      status: channel.status,
      conversations: channelConversations.length,
      open: channelConversations.filter((conversation) => conversation.status !== 'resolved').length,
      inbound: channelMessages.filter((message) => message.direction === 'in').length,
      outbound: channelMessages.filter((message) => message.direction === 'out').length,
    }
  })

  const agentStats = state.agents.map((agent) => {
    const assigned = conversations.filter((conversation) => conversation.assigneeId === agent.id)
    return {
      id: agent.id,
      name: agent.name,
      availability: agent.availability,
      open: assigned.filter((conversation) => conversation.status !== 'resolved').length,
      resolvedToday: assigned.filter((conversation) => typeof conversation.resolvedAt === 'string' && conversation.resolvedAt.slice(0, 10) === today).length,
      total: assigned.length,
    }
  })

  const lastSeven = days.slice(-7)
  const broadcastStats = {
    sent: state.broadcasts.filter((broadcast) => broadcast.status === 'sent').length,
    scheduled: state.broadcasts.filter((broadcast) => broadcast.status === 'scheduled').length,
    drafted: state.broadcasts.filter((broadcast) => broadcast.status === 'draft').length,
    delivered: state.broadcasts.reduce((sum, broadcast) => sum + (broadcast.stats?.sent ?? 0), 0),
    failed: state.broadcasts.reduce((sum, broadcast) => sum + (broadcast.stats?.failed ?? 0), 0),
  }

  return {
    generatedAt: nowIso(),
    totals: {
      conversations: conversations.length,
      open: openConversations.length,
      unread: conversations.reduce((sum, conversation) => sum + (conversation.unread ?? 0), 0),
      awaiting: awaiting.length,
      breached: breached.length,
      resolvedToday: conversations.filter((conversation) => typeof conversation.resolvedAt === 'string' && conversation.resolvedAt.slice(0, 10) === today).length,
      contacts: state.contacts.length,
      channels: state.channels.length,
      activeChannels: state.channels.filter((channel) => channel.status === 'active').length,
      messages7d: lastSeven.reduce((sum, day) => sum + day.total, 0),
      avgFirstResponseSeconds: firstResponses.length === 0 ? null : Math.round(firstResponses.reduce((sum, value) => sum + value, 0) / firstResponses.length),
      avgResolutionSeconds: resolutions.length === 0 ? null : Math.round(resolutions.reduce((sum, value) => sum + value, 0) / resolutions.length),
    },
    volume: days,
    channels: channelStats,
    agents: agentStats,
    broadcasts: broadcastStats,
  }
}

/**
 * Strip bridge secrets and add presentation-only fields.
 * @param {Record<string, any>} state - current state.
 * @returns {Record<string, any>} browser-safe snapshot.
 */
export function publicState(state, dataFile = null) {
  const snapshot = clone(state)
  snapshot.channels = snapshot.channels.map((channel) => publicChannel(channel))
  snapshot.channelPlatforms = publicCatalog()
  snapshot.events = snapshot.events.slice(-120)
  // The robot webhook is a credential: clients only learn whether one exists.
  snapshot.workspace.notify = {
    enabled: snapshot.workspace.notify?.enabled === true,
    configured: typeof snapshot.workspace.notify?.wecomWebhook === 'string'
      && snapshot.workspace.notify.wecomWebhook !== '',
    quietStart: snapshot.workspace.notify?.quietStart ?? '',
    quietEnd: snapshot.workspace.notify?.quietEnd ?? '',
    privatePreview: snapshot.workspace.notify?.privatePreview === true,
    linkTemplate: snapshot.workspace.notify?.linkTemplate ?? '',
  }
  snapshot.analytics = deriveAnalytics(state)
  snapshot.dataFile = dataFile
  snapshot.serverTime = nowIso()
  return snapshot
}

/** One opened, atomically persisted workspace document. */
export class Store {
  /** @type {string} */
  #file
  /** @type {Record<string, any>} */
  #state
  /** @type {Promise<unknown>} */
  #writeTail = Promise.resolve()

  /**
   * @param {string} [file] - state path; defaults to the profile data directory.
   */
  constructor(file = defaultStatePath()) {
    this.#file = file
    this.#state = emptyState({})
  }

  /** @returns {Record<string, any>} live Host-owned state. */
  get state() {
    return this.#state
  }

  /** @returns {string} absolute data file path. */
  get file() {
    return this.#file
  }

  /**
   * Load the document, creating the demo workspace on first run.
   * @returns {Promise<Record<string, any>>} loaded state.
   */
  async load() {
    try {
      const raw = await readFile(this.#file, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed === null || typeof parsed !== 'object') throw new Error('The state document is not an object.')
      this.#state = normalizeState(parsed)
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code
      if (code !== 'ENOENT') {
        const backup = `${this.#file}.corrupt-${Date.now()}`
        console.warn(`[im-omni] state could not be read; backing up to ${backup} and starting from demo data:`, error)
        try {
          await rename(this.#file, backup)
        } catch {
          // A missing or unreadable file still falls through to a fresh workspace.
        }
      }
      this.#state = emptyState({})
      await this.commit({ bumpRevision: false })
    }
    return this.#state
  }

  /**
   * Persist the current document atomically and advance its revision.
   * @param {{bumpRevision?: boolean}} [options] - commit controls.
   * @returns {Promise<Record<string, any>>} current state.
   */
  async commit(options = {}) {
    if (options.bumpRevision !== false) {
      this.#state.meta.revision = (Number(this.#state.meta.revision) || 0) + 1
    }
    this.#state.meta.updatedAt = nowIso()
    const snapshot = JSON.stringify(this.#state, null, 2)
    const file = this.#file
    this.#writeTail = this.#writeTail.catch(() => {}).then(async () => {
      await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
      const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, file)
    })
    await this.#writeTail
    return this.#state
  }

  /**
   * Add one bounded activity record.
   * @param {string} type - event type.
   * @param {string} text - human-readable summary.
   * @param {{conversationId?: string|null, channelId?: string|null, actorId?: string|null}} [refs] - related ids.
   * @returns {void}
   */
  event(type, text, refs = {}) {
    this.#state.events.push({
      id: makeId('evt'),
      type,
      text,
      conversationId: refs.conversationId ?? null,
      channelId: refs.channelId ?? null,
      actorId: refs.actorId ?? null,
      createdAt: nowIso(),
    })
    if (this.#state.events.length > 2000) {
      this.#state.events.splice(0, this.#state.events.length - 2000)
    }
  }

  /**
   * Remove the seeded demo entities without touching records created by the
   * user. This is deliberately id-based: only the fixture shipped in seed.js
   * is deleted, so a workspace that mixed demo data with real channels keeps
   * the real ones.
   * @returns {Promise<Record<string, any>>} cleaned state.
   */
  async exitDemo() {
    const channels = new Set(['chn_web', 'chn_app', 'chn_partner'])
    const contacts = new Set(['ct_lin', 'ct_diego', 'ct_priya', 'ct_hana', 'ct_tom', 'ct_aisha', 'ct_lucas', 'ct_mei'])
    const conversations = new Set(['cnv_lin', 'cnv_diego', 'cnv_priya', 'cnv_hana', 'cnv_tom', 'cnv_aisha', 'cnv_lucas', 'cnv_mei'])
    const templates = new Set(['tpl_greeting', 'tpl_refund', 'tpl_shipping', 'tpl_api', 'tpl_cn'])
    const automations = new Set(['atm_refund', 'atm_urgent', 'atm_vip_route'])
    const broadcasts = new Set(['brd_october', 'brd_maintenance', 'brd_draft'])
    const agents = new Set(['agent_you', 'agent_mia', 'agent_noah', 'agent_ava'])
    this.#state.channels = this.#state.channels.filter((item) => !channels.has(item.id))
    this.#state.contacts = this.#state.contacts.filter((item) => !contacts.has(item.id))
      .map((item) => ({
        ...item,
        identities: (item.identities ?? []).filter((identity) => !channels.has(identity.channelId)),
      }))
    this.#state.conversations = this.#state.conversations.filter((item) => !conversations.has(item.id) && !channels.has(item.channelId))
    this.#state.templates = this.#state.templates.filter((item) => !templates.has(item.id))
    this.#state.automations = this.#state.automations.filter((item) => !automations.has(item.id))
    this.#state.broadcasts = this.#state.broadcasts.filter((item) => !broadcasts.has(item.id))
    this.#state.events = this.#state.events.filter((item) => !conversations.has(item.conversationId) && !channels.has(item.channelId))
    this.#state.agents = this.#state.agents.filter((item) => !agents.has(item.id))
    for (const conversation of this.#state.conversations) {
      if (agents.has(conversation.assigneeId)) conversation.assigneeId = null
    }
    if (agents.has(this.#state.workspace.currentAgentId)) this.#state.workspace.currentAgentId = null
    if (this.#state.workspace.name === 'Acme Support') this.#state.workspace.name = 'Support workspace'
    this.#state.demo = false
    await this.commit()
    return this.#state
  }

  /**
   * Replace the document with the demo workspace.
   * @returns {Promise<Record<string, any>>} new state.
   */
  async resetDemo() {
    const revision = (Number(this.#state.meta.revision) || 0) + 1
    this.#state = seedState()
    this.#state.meta.revision = revision
    await this.commit({ bumpRevision: false })
    return this.#state
  }

  /**
   * Replace the document with an empty workspace while keeping basic settings.
   * @returns {Promise<Record<string, any>>} new state.
   */
  async clearAll() {
    const revision = (Number(this.#state.meta.revision) || 0) + 1
    const workspace = {
      name: this.#state.workspace.name,
      timezone: this.#state.workspace.timezone,
      businessHours: this.#state.workspace.businessHours,
      autoAssign: this.#state.workspace.autoAssign,
      defaultSlaMinutes: this.#state.workspace.defaultSlaMinutes,
      currentAgentId: null,
    }
    this.#state = emptyState(workspace)
    this.#state.meta.revision = revision
    await this.commit({ bumpRevision: false })
    return this.#state
  }
}
