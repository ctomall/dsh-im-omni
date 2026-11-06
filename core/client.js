/**
 * Shared client module: the transport to the team API, the row mapping the inbox
 * renders, and the role labels. Both `dsh-im-omni` and `dsh-im-omni-access`
 * request this module through `dsh.client.external`.
 * @module dsh-im-omni-core/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-im-omni-core',
  factory() {
    /**
     * Call the team API: same-origin path first, plugin Host proxy second.
     * @param {string} path - `/v1/...`.
     * @param {{method?: string, body?: unknown, token?: string, proxyPath?: string}} [options] - request.
     * @returns {Promise<{ok: boolean, status: number, json: () => Promise<any>}>} response-like.
     */
    async function proxySaas(path, options = {}) {
      const token = options.token ?? ''
      const method = options.method ?? 'GET'
      const headers = { accept: 'application/json' }
      if (token !== '') headers.authorization = `Bearer ${token}`
      const init = { method, headers }
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json'
        init.body = JSON.stringify(options.body)
      }
      try {
        const direct = await fetch(`/im-omni-api${path}`, init)
        const text = await direct.text()
        let payload = null
        try { payload = text === '' ? null : JSON.parse(text) } catch { payload = null }
        if (payload !== null || direct.status !== 404) {
          return { ok: direct.ok, status: direct.status, json: async () => payload }
        }
      } catch {
        // Network failure: fall through to the plugin proxy.
      }
      const response = await fetch(options.proxyPath ?? '/api/im-omni.saas', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ path, method, body: options.body, token }),
      })
      const payload = await response.json().catch(() => null)
      return { ok: response.ok, status: response.status, json: async () => payload }
    }

    /** Map one API conversation onto the inbox shape. */
    function toConversation(row) {
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

    /** Map one API message onto the message shape. */
    function toMessage(row) {
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

    /** Human label for a membership role. */
    function membershipLabel(role) {
      if (role === 'owner') return '所有者'
      if (role === 'admin') return '管理员'
      if (role === 'viewer') return '只读'
      return '客服'
    }

    /**
     * Build the inbox adapter over the shared transport.
     * @param {{token: string, proxyPath?: string}} options - token and optional proxy route.
     * @returns {Record<string, Function>} adapter methods.
     */
    function createTeamInbox(options) {
      const token = options.token
      const proxyPath = options.proxyPath
      const call = async (path, init = {}) => {
        const response = await proxySaas(path, { method: init.method ?? 'GET', body: init.body, token, proxyPath })
        const body = await response.json()
        if (!response.ok) {
          const error = new Error(body?.error?.message ?? `HTTP ${response.status}`)
          error.code = body?.error?.code
          throw error
        }
        return body
      }
      return {
        async load(limits = {}) {
          const limit = Number(limits.limit ?? 30)
          const [conversations, contacts, channels] = await Promise.all([
            call(`/v1/conversations?limit=${limit}`),
            call('/v1/contacts'),
            call('/v1/channels'),
          ])
          const snapshot = {
            conversations: (conversations.items ?? []).map(toConversation),
            contacts: (contacts.items ?? []).map((row) => ({
              id: row.id, name: row.name ?? '', handle: row.handle ?? '', phone: row.phone ?? '',
              tags: Array.isArray(row.tags) ? row.tags : [], channelId: row.channel_id ?? null,
            })),
            channels: (channels.items ?? []).map((row) => ({
              id: row.id, name: row.name ?? '', type: row.type ?? 'webhook', status: row.status ?? 'active',
              runtime: { health: row.health ?? 'ready', lastError: '', qrStatus: 'disconnected', account: '' },
              stats: { inbound: 0, outbound: 0 }, config: {},
            })),
          }
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
        async read(conversationId) {
          await call(`/v1/conversations/${conversationId}/read`, { method: 'POST' })
        },
        async update(conversationId, fields) {
          const body = {}
          for (const key of ['status', 'priority', 'tags', 'muted', 'botPaused']) {
            if (fields[key] !== undefined) body[key] = fields[key]
          }
          if (Object.keys(body).length === 0) return
          await call(`/v1/conversations/${conversationId}`, { method: 'PATCH', body })
        },
        async send(conversationId, body) {
          const result = await call('/v1/messages', { method: 'POST', body: { conversationId, body } })
          return result.message ?? null
        },
      }
    }

    return { proxySaas, toConversation, toMessage, membershipLabel, createTeamInbox }
  },
})
