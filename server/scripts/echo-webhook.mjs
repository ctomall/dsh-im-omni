#!/usr/bin/env node
/**
 * Local provider bridge used for demos and the dispatch test.
 *
 * It acknowledges every message and prints it, which is enough to exercise the
 * `queued -> sent` path without a real WhatsApp/Telegram account.
 */
import { createServer } from 'node:http'

const port = Number(process.env.ECHO_PORT ?? 8099)
const server = createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    console.log(`[echo] ${request.method} ${request.url} ${body.slice(0, 200)}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end('{"ok":true}')
  })
})
server.listen(port, '127.0.0.1', () => console.log(`echo bridge on http://127.0.0.1:${port}`))
