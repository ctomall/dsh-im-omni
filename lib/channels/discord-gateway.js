/**
 * Minimal Discord Gateway v10 client for MESSAGE_CREATE events.
 * @module dsh-im-omni/lib/channels/discord-gateway
 */
import { text } from '../util.js'
import { parseMessage } from './discord.js'

/** Intents: GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES, MESSAGE_CONTENT. */
const INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15)

/**
 * Sleep that resolves early when aborted.
 * @param {number} milliseconds - delay.
 * @param {AbortSignal} signal - abort signal.
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

/** One reconnecting Gateway connection for a channel. */
export class DiscordGateway {
  /**
   * @param {Record<string, any>} channel - channel record.
   * @param {(payload:Record<string, any>)=>Promise<void>} onMessage - ingest callback.
   * @param {(message:string)=>void} [log] - logger.
   */
  constructor(channel, onMessage, log = () => {}) {
    this.channel = channel
    this.onMessage = onMessage
    this.log = log
    this.stopped = false
    this.socket = null
    this.abort = new AbortController()
    this.task = null
    this.selfId = ''
  }

  /** Start the reconnect loop once. */
  start() {
    if (this.task !== null) return
    this.task = this.#run().catch((error) => {
      if (!this.stopped) this.log(`Discord gateway stopped: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  /** Stop the connection and reconnect loop. */
  stop() {
    this.stopped = true
    this.abort.abort()
    try {
      this.socket?.close(1000, 'shutdown')
    } catch {
      // The socket may already be closed.
    }
    this.socket = null
  }

  /** @returns {Promise<void>} reconnect loop. */
  async #run() {
    let backoff = 2_000
    while (!this.stopped) {
      const started = Date.now()
      try {
        await this.#connect()
      } catch (error) {
        if (!this.stopped) this.log(`Discord gateway error: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (this.stopped) break
      if (Date.now() - started > 60_000) backoff = 2_000
      await sleep(backoff, this.abort.signal)
      backoff = Math.min(60_000, backoff * 2)
    }
  }

  /**
   * Open one Gateway session and resolve when it closes.
   * @returns {Promise<void>} closed.
   */
  async #connect() {
    const token = text(this.channel.config?.botToken, 500)
    if (token === '') throw new Error('missing bot token')
    const socket = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json')
    this.socket = socket
    let sequence = null
    let heartbeatTimer = null
    let awaitingAck = false
    let closed = false
    const onAbort = () => {
      try {
        socket.close(1000, 'shutdown')
      } catch {
        // Ignore a close race.
      }
    }
    this.abort.signal.addEventListener('abort', onAbort, { once: true })

    await new Promise((resolve, reject) => {
      /**
       * @param {number} op - opcode.
       * @param {unknown} d - payload data.
       */
      const send = (op, d) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op, d }))
      }
      const finish = (error) => {
        if (closed) return
        closed = true
        clearInterval(heartbeatTimer)
        this.abort.signal.removeEventListener('abort', onAbort)
        this.socket = null
        if (error === undefined) resolve()
        else reject(error)
      }
      socket.addEventListener('message', (event) => {
        let packet
        try {
          packet = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (typeof packet?.s === 'number') sequence = packet.s
        if (packet?.op === 10) {
          const interval = Math.max(1_000, Number(packet.d?.heartbeat_interval) || 41_250)
          const beat = () => {
            if (awaitingAck) {
              try {
                socket.close(4000, 'heartbeat timeout')
              } catch {
                // Ignore.
              }
              return
            }
            awaitingAck = true
            send(1, sequence)
          }
          heartbeatTimer = setInterval(beat, interval)
          setTimeout(beat, Math.floor(interval * Math.random()))
          send(2, {
            token,
            intents: INTENTS,
            properties: { os: 'linux', browser: 'dsh', device: 'dsh' },
          })
        } else if (packet?.op === 11) {
          awaitingAck = false
        } else if (packet?.op === 7) {
          try {
            socket.close(4000, 'reconnect')
          } catch {
            // Ignore.
          }
        } else if (packet?.op === 9) {
          try {
            socket.close(4000, 'invalid session')
          } catch {
            // Ignore.
          }
        } else if (packet?.op === 0 && packet.t === 'READY') {
          this.selfId = text(packet.d?.user?.id, 100)
        } else if (packet?.op === 0 && packet.t === 'MESSAGE_CREATE') {
          const payload = parseMessage(packet.d, this.selfId)
          if (payload !== null) {
            void this.onMessage(payload).catch((error) => this.log(`Discord ingest failed: ${error instanceof Error ? error.message : String(error)}`))
          }
        }
      })
      socket.addEventListener('close', () => finish())
      socket.addEventListener('error', () => finish(new Error('WebSocket error')))
    })
  }
}
