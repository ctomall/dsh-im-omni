/**
 * Team-backed inbox adapter.
 *
 * The panel's inbox renders one snapshot object. In team mode that snapshot comes
 * from the team service, which has already filtered rows by the member's
 * permission, so nothing here decides who may see what.
 * @module dsh-im-omni/lib/team-inbox
 */

/**
 * Map one API conversation onto the shape the inbox expects.
 * @param {Record<string, any>} row - `/v1/conversations` item.
 * @returns {Record<string, any>} conversation.
 */
export function toConversation(row) {
  return {
    id: row.id,
    channelId: row.channel_id,
    contactId: row.contact_id,
    subject: row.subject ?? '',
    status: row.status ?? 'open',
    priority: row.priority ?? 'normal',
    unread: Number(row.unread ?? 0),
    tags: Array.isArray(row.tags) ? row.tags : [],
    botPaused: row.bot_paused === true,
    muted: row.muted === true,
    lastInboundAt: row.last_inbound_at ?? null,
    updatedAt: row.updated_at ?? null,
    ownerId: row.owner_user_id ?? null,
    messages: [],
    team: true,
  }
}

/**
 * Map one API message onto the shape the message list expects.
 * @param {Record<string, any>} row - `/v1/conversations/{id}/messages` item.
 * @returns {Record<string, any>} message.
 */
export function toMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction === 'outbound' ? 'outbound' : 'inbound',
    body: row.body ?? '',
    at: row.created_at ?? row.at ?? null,
    status: row.status ?? 'sent',
    authorType: row.author_type === 'agent' ? 'agent' : 'contact',
    team: true,
  }
}

/**
 * Map API lists onto the snapshot the views already know.
 * @param {{conversations?: any[], contacts?: any[], channels?: any[]}} input - API payloads.
 * @returns {{conversations: any[], contacts: any[], channels: any[]}} snapshot slice.
 */
export function toSnapshot(input) {
  const conversations = (input.conversations ?? []).map(toConversation)
  const contacts = (input.contacts ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? '',
    handle: row.handle ?? '',
    phone: row.phone ?? '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    channelId: row.channel_id ?? null,
  }))
  const channels = (input.channels ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? '',
    type: row.type ?? 'webhook',
    status: row.status ?? 'active',
    runtime: { health: row.health ?? 'ready', lastError: '', qrStatus: 'disconnected', account: '' },
    stats: { inbound: 0, outbound: 0 },
    config: {},
  }))
  return { conversations, contacts, channels }
}

/**
 * Build the inbox adapter over an HTTP transport.
 * @param {object} options - adapter options.
 * @param {(path: string, init?: object) => Promise<{ok: boolean, status: number, json: () => Promise<any>}>} options.call - API transport (proxy).
 * @param {string} options.token - team token.
 * @param {(path: string, options?: object) => Promise<{ok: boolean, status: number, body: any}>} [options.raw] - transport returning parsed bodies.
 * @returns {Record<string, Function>} adapter methods.
 */
export function createTeamInbox(options) {
  const token = options.token

  /** One API call returning a parsed body. */
  async function call(path, init = {}) {
    const response = await options.call(path, { ...init, token })
    const body = await response.json()
    if (!response.ok) {
      const error = new Error(body?.error?.message ?? `HTTP ${response.status}`)
      error.code = body?.error?.code
      error.status = response.status
      throw error
    }
    return body
  }

  return {
    /**
     * Load the lists the inbox shows, plus the latest messages of each conversation.
     * @param {{limit?: number, messageLimit?: number}} [limits] - how much to fetch.
     * @returns {Promise<{conversations: any[], contacts: any[], channels: any[]}>} snapshot slice.
     */
    async load(limits = {}) {
      const limit = Number(limits.limit ?? 30)
      const [conversations, contacts, channels] = await Promise.all([
        call(`/v1/conversations?limit=${limit}`),
        call('/v1/contacts'),
        call('/v1/channels'),
      ])
      const snapshot = toSnapshot({
        conversations: conversations.items ?? [],
        contacts: contacts.items ?? [],
        channels: channels.items ?? [],
      })
      // The list view renders messages inline, so hydrate the first few.
      await Promise.all(snapshot.conversations.slice(0, Number(limits.messageLimit ?? 8)).map(async (conversation) => {
        try {
          const messages = await call(`/v1/conversations/${conversation.id}/messages`)
          conversation.messages = (messages.items ?? []).slice(-40).map(toMessage)
        } catch {
          conversation.messages = []
        }
      }))
      return snapshot
    },

    /**
     * Mark a conversation read.
     * @param {string} conversationId - id.
     * @returns {Promise<void>} nothing.
     */
    async read(conversationId) {
      await call(`/v1/conversations/${conversationId}/read`, { method: 'POST' })
    },

    /**
     * Patch a conversation (status, priority, tags, mute, bot pause).
     * @param {string} conversationId - id.
     * @param {Record<string, any>} fields - UI fields.
     * @returns {Promise<void>} nothing.
     */
    async update(conversationId, fields) {
      const body = {}
      if (fields.status !== undefined) body.status = fields.status
      if (fields.priority !== undefined) body.priority = fields.priority
      if (fields.tags !== undefined) body.tags = fields.tags
      if (fields.muted !== undefined) body.muted = fields.muted
      if (fields.botPaused !== undefined) body.botPaused = fields.botPaused
      if (Object.keys(body).length === 0) return
      await call(`/v1/conversations/${conversationId}`, { method: 'PATCH', body })
    },

    /**
     * Send a reply into a conversation.
     * @param {string} conversationId - id.
     * @param {string} body - text.
     * @returns {Promise<any>} created message.
     */
    async send(conversationId, body) {
      const result = await call('/v1/messages', { method: 'POST', body: { conversationId, body } })
      return result.message ?? null
    },

    /**
     * Create a channel.
     * @param {{name: string, type: string}} input - channel fields.
     * @returns {Promise<any>} created channel.
     */
    /**
     * Create a shared reply template.
     * @param {{name: string, body: string, shortcut?: string}} input - template fields.
     * @returns {Promise<any>} created template.
     */
    async createTemplate(input) {
      return call('/v1/templates', { method: 'POST', body: { name: input.name, shortcut: input.shortcut ?? '', body: input.body } })
    },

    /**
     * Update a template (author or admin).
     * @param {string} templateId - id.
     * @param {{name?: string, body?: string, shortcut?: string}} fields - changes.
     * @returns {Promise<any>} updated template.
     */
    async updateTemplate(templateId, fields) {
      const body = {}
      for (const key of ['name', 'shortcut', 'body']) if (fields[key] !== undefined) body[key] = fields[key]
      return call(`/v1/templates/${templateId}`, { method: 'PATCH', body })
    },

    /**
     * Delete a template (author or admin).
     * @param {string} templateId - id.
     * @returns {Promise<any>} result.
     */
    async deleteTemplate(templateId) {
      return call(`/v1/templates/${templateId}`, { method: 'DELETE' })
    },

    /**
     * Save the tenant-level workspace settings (name, SLA, bot, hours).
     * @param {Record<string, any>} fields - subset of the settings payload.
     * @returns {Promise<void>} nothing.
     */
    async updateWorkspace(fields) {
      const body = {}
      for (const key of ['name', 'timezone', 'defaultSlaMinutes', 'autoAssign', 'autoTranslate', 'translationTarget', 'aiSuggestions', 'bot', 'businessHours']) {
        if (fields[key] !== undefined) body[key] = fields[key]
      }
      if (Object.keys(body).length > 0) await call('/v1/settings/workspace', { method: 'PATCH', body })
    },

    /**
     * Save the notification robot settings.
     * @param {Record<string, any>} notify - enabled/webhook/quiet/link fields.
     * @returns {Promise<void>} nothing.
     */
    async updateNotify(notify) {
      const body = {}
      for (const key of ['enabled', 'wecomWebhook', 'quietStart', 'quietEnd', 'linkTemplate']) {
        if (notify[key] !== undefined) body[key] = notify[key]
      }
      if (Object.keys(body).length > 0) await call('/v1/settings/notify', { method: 'PUT', body })
    },

    async createChannel(input) {
      return call('/v1/channels', { method: 'POST', body: input })
    },

    /**
     * Rename or pause a channel.
     * @param {string} channelId - id.
     * @param {{name?: string, status?: string}} fields - changes.
     * @returns {Promise<any>} updated channel.
     */
    async updateChannel(channelId, fields) {
      const body = {}
      if (fields.name !== undefined) body.name = fields.name
      if (fields.status !== undefined) body.status = fields.status
      if (Object.keys(body).length === 0) return null
      return call(`/v1/channels/${channelId}`, { method: 'PATCH', body })
    },

    /**
     * Delete a channel (owner applies, admin gets an approval request).
     * @param {string} channelId - id.
     * @returns {Promise<any>} result.
     */
    async deleteChannel(channelId) {
      return call(`/v1/channels/${channelId}`, { method: 'DELETE' })
    },
  }
}
