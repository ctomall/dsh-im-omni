#!/usr/bin/env node
/**
 * Local stand-in for the WhatsApp Cloud Graph endpoint, used by demos and tests.
 * Prints what it received and answers like Graph does.
 */
import { createServer } from 'node:http'

const port = Number(process.env.GRAPH_PORT ?? 8098)
const server = createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    console.log(`[graph] ${request.method} ${request.url} auth=${request.headers.authorization ?? ''} ${Buffer.concat(chunks).toString('utf8')}`)
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ messages: [{ id: `wamid.demo.${Date.now()}` }] }))
  })
})
server.listen(port, '127.0.0.1', () => console.log(`fake graph on http://127.0.0.1:${port}`))
