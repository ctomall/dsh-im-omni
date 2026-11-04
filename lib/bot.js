/**
 * Autonomous reception bot.
 *
 * The bot reacts to a new inbound message, debounces bursts, asks the default
 * Harness model for one contextual reply, and hands the conversation to a
 * human when the model or a keyword asks for it. It never replies while a
 * human has taken over (`conversation.botPaused`).
 * @module @local/im-omni/lib/bot
 */

/**
 * Check whether the latest customer text should force a handoff.
 * @param {string} body - customer message.
 * @param {string} keywords - comma/newline separated keywords.
 * @returns {boolean} handoff.
 */
function matchesHandoff(body, keywords) {
  const value = String(body ?? '').toLowerCase()
  if (value === '') return false
  return String(keywords ?? '')
    .split(/[,，\\n]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .some((word) => value.includes(word))
}

/** Owns debounce and duplicate-run guards for all conversations. */
export class ReceptionBot {
  /**
   * @param {Record<string, any>} runtime - Host runtime.
   * @param {Record<string, any>} intelligence - intelligence facade.
   * @param {(message:string)=>void} log - logger.
   */
  constructor(runtime, intelligence, log = () => {}) {
    this.runtime = runtime
    this.intelligence = intelligence
    this.log = log
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    this.timers = new Map()
    /** @type {Set<string>} */
    this.running = new Set()
  }

  /**
   * Schedule a bot pass after an inbound message.
   * @param {string} conversationId - conversation.
   * @returns {void}
   */
  onInbound(conversationId) {
    if (this.runtime.store.state.workspace.bot?.enabled !== true) return
    clearTimeout(this.timers.get(conversationId))
    const timer = setTimeout(() => {
      this.timers.delete(conversationId)
      void this.#run(conversationId)
    }, 1_200)
    this.timers.set(conversationId, timer)
  }

  /**
   * Run one bot pass.
   * @param {string} conversationId - conversation.
   * @returns {Promise<void>} completion.
   */
  async #run(conversationId) {
    if (this.running.has(conversationId)) return
    this.running.add(conversationId)
    try {
      const state = this.runtime.store.state
      const workspace = state.workspace
      if (workspace.bot?.enabled !== true) return
      const conversation = state.conversations.find((item) => item.id === conversationId)
      if (conversation === undefined || conversation.botPaused === true) return
      if (conversation.status === 'resolved' || conversation.status === 'snoozed') return
      const last = conversation.messages[conversation.messages.length - 1]
      if (last === undefined || last.direction !== 'in') return
      if (conversation.messages.some((message) => message.direction === 'in' && message.id === last.id && message.botHandled === true)) return
      const maxTurns = Math.max(1, Math.min(100, Number(workspace.bot?.maxTurns) || 12))
      if ((Number(conversation.botTurns) || 0) >= maxTurns) {
        await this.runtime.handoffBot(conversationId, `Max auto-replies reached (${maxTurns}).`)
        return
      }
      if (matchesHandoff(last.text, workspace.bot?.handoffKeywords)) {
        await this.runtime.handoffBot(conversationId, 'Customer asked for a human or a sensitive topic.')
        return
      }
      await this.runtime.markBotHandled(conversationId, last.id)
      const contact = state.contacts.find((item) => item.id === conversation.contactId)
      const channel = state.channels.find((item) => item.id === conversation.channelId)
      const result = await this.intelligence.draftReception(this.runtime, conversation, contact, channel, workspace)
      if (result.handoff) {
        await this.runtime.handoffBot(conversationId, result.reason)
        return
      }
      await this.runtime.replyAsBot(conversationId, result.text, result.model)
    } catch (error) {
      this.log(`Reception bot failed: ${error instanceof Error ? error.message : String(error)}`)
      try {
        await this.runtime.handoffBot(conversationId, 'Bot error; needs human review.')
      } catch {
        // The conversation may have disappeared.
      }
    } finally {
      this.running.delete(conversationId)
    }
  }

  /** Clear pending debounce timers. */
  stop() {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
