/**
 * Long-lived channel workers: Telegram long polling and Discord Gateway.
 * @module dsh-im-omni/lib/channels/runtime
 */
import { attachInboundMedia, getUpdates, parseUpdate } from './telegram.js'
import { DiscordGateway } from './discord-gateway.js'
import { ensure as ensureEmbedded, stop as stopEmbedded, stopAll as stopAllEmbedded } from './whatsapp-embedded.js'

/**
 * Sleep that resolves early when aborted.
 * @param {number} milliseconds - delay.
 * @param {AbortSignal} signal - signal.
 * @returns {Promise<void>} completion.
 */
function sleep(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

/**
 * Owns the background workers for all active channels.
 */
export class ChannelRuntime {
  /**
   * @param {{
   *   store: Record<string, any>,
   *   ingest: (channelId:string,payload:Record<string,any>)=>Promise<unknown>,
   *   log: (message:string)=>void
   * }} services - dependencies.
   */
  constructor(services) {
    this.store = services.store
    this.ingest = services.ingest
    this.log = services.log
    /** @type {Map<string,{signature:string,stop:()=>void}>} */
    this.workers = new Map()
  }

  /**
   * Start, restart, or stop workers to match current channels.
   * @returns {void}
   */
  sync() {
    const wanted = new Set()
    for (const channel of this.store.state.channels) {
      if (channel.status !== 'active') continue
      const signature = JSON.stringify({ type: channel.type, config: channel.config ?? {}, updatedAt: channel.updatedAt })
      if (channel.type === 'telegram' && channel.config?.mode !== 'webhook') {
        wanted.add(channel.id)
        this.#ensure(channel, signature, () => this.#startTelegram(channel))
      } else if (channel.type === 'discord') {
        wanted.add(channel.id)
        this.#ensure(channel, signature, () => this.#startDiscord(channel))
      } else if (channel.type === 'whatsapp_qr' && channel.config?.mode !== 'bridge') {
        wanted.add(channel.id)
        this.#ensure(channel, signature, () => this.#startEmbedded(channel))
      }
    }
    for (const [id, worker] of this.workers) {
      if (!wanted.has(id)) {
        worker.stop()
        this.workers.delete(id)
      }
    }
  }

  /** Stop every worker. */
  stop() {
    for (const worker of this.workers.values()) worker.stop()
    this.workers.clear()
    stopAllEmbedded()
  }

  /**
   * Create or restart one worker when its configuration changed.
   * @param {Record<string, any>} channel - channel.
   * @param {string} signature - config signature.
   * @param {() => {stop:()=>void}} factory - worker factory.
   * @returns {void}
   */
  #ensure(channel, signature, factory) {
    const existing = this.workers.get(channel.id)
    if (existing !== undefined && existing.signature === signature) return
    existing?.stop()
    const worker = factory()
    this.workers.set(channel.id, { signature, stop: worker.stop })
  }

  /**
   * Start Telegram long polling.
   * @param {Record<string, any>} channel - channel snapshot.
   * @returns {{stop:()=>void}} worker.
   */
  #startTelegram(channel) {
    const abort = new AbortController()
    let offset = 0
    let failures = 0
    const task = (async () => {
      while (!abort.signal.aborted) {
        const result = await getUpdates(channel, offset, abort.signal)
        if (abort.signal.aborted) break
        if (!result.ok) {
          failures += 1
          this.log(`Telegram poll failed for ${channel.name}: ${result.error}`)
          await sleep(Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5)), abort.signal)
          continue
        }
        failures = 0
        offset = result.nextOffset
        for (const update of result.updates) {
          const payload = parseUpdate(update)
          if (payload === null) continue
          const enriched = await attachInboundMedia(channel, update, payload)
          try {
            await this.ingest(channel.id, enriched)
          } catch (error) {
            this.log(`Telegram ingest failed for ${channel.name}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
    })().catch((error) => {
      if (!abort.signal.aborted) this.log(`Telegram worker stopped for ${channel.name}: ${error instanceof Error ? error.message : String(error)}`)
    })
    return {
      stop: () => {
        abort.abort()
        void task
      },
    }
  }

  /**
   * Start the in-Host WhatsApp QR session.
   * @param {Record<string, any>} channel - channel snapshot.
   * @returns {{stop:()=>void}} worker.
   */
  #startEmbedded(channel) {
    const runtime = { store: this.store, ingest: this.ingest }
    void ensureEmbedded(channel, runtime).catch((error) => {
      this.log(`WhatsApp QR start failed for ${channel.name}: ${error instanceof Error ? error.message : String(error)}`)
    })
    return { stop: () => stopEmbedded(channel.id) }
  }

  /**
   * Start one Discord Gateway connection.
   * @param {Record<string, any>} channel - channel snapshot.
   * @returns {{stop:()=>void}} worker.
   */
  #startDiscord(channel) {
    const gateway = new DiscordGateway(
      channel,
      async (payload) => {
        await this.ingest(channel.id, payload)
      },
      (message) => this.log(message),
    )
    gateway.start()
    return { stop: () => gateway.stop() }
  }
}
