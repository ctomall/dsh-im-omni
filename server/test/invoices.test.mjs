/**
 * S4 minimum: an auditable invoice ledger per tenant.
 *
 * Generation is idempotent per period, the amount comes from the plan, status
 * moves draft -> issued -> paid, and another tenant can neither read nor move it.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { closeDb } from '../src/db.mjs'
import { createApp } from '../src/app.mjs'

/** @type {import('node:http').Server} */
let server
/** @type {string} */
let base

before(async () => {
  server = createApp()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await closeDb()
})

async function post(path, payload, token) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(payload),
  })
  return { status: response.status, body: await response.json() }
}

async function get(path, token) {
  const response = await fetch(`${base}${path}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  })
  return { status: response.status, body: await response.json() }
}

async function register(label) {
  const result = await post('/v1/auth/register', {
    email: `${label}-${Date.now()}${Math.floor(Math.random() * 1000)}@test.local`,
    password: 'correct horse battery',
    name: label,
    tenantName: `${label} 团队`,
  })
  assert.equal(result.status, 201, JSON.stringify(result.body))
  return result.body
}

test('generating an invoice bills the plan price for the period', async () => {
  const session = await register('inv-a')
  const plan = await get('/v1/billing/plan', session.accessToken)
  const created = await post('/v1/billing/invoices', {}, session.accessToken)
  assert.equal(created.status, 201, JSON.stringify(created.body))
  assert.equal(created.body.invoice.amount_cents, plan.body.plan.priceCents)
  assert.equal(created.body.invoice.status, 'draft')
  assert.equal(created.body.invoice.currency, 'CNY')
})

test('generating twice for the same period is idempotent', async () => {
  const session = await register('inv-b')
  const first = await post('/v1/billing/invoices', {}, session.accessToken)
  assert.equal(first.status, 201)
  const second = await post('/v1/billing/invoices', {}, session.accessToken)
  assert.equal(second.status, 200)
  assert.equal(second.body.created, false)
  assert.equal(second.body.invoice.id, first.body.invoice.id)
  const list = await get('/v1/billing/invoices', session.accessToken)
  assert.equal(list.body.items.length, 1)
})

test('an invoice moves draft -> issued -> paid', async () => {
  const session = await register('inv-c')
  const created = await post('/v1/billing/invoices', {}, session.accessToken)
  const id = created.body.invoice.id
  const issued = await post(`/v1/billing/invoices/${id}/status`, { status: 'issued' }, session.accessToken)
  assert.equal(issued.status, 200)
  assert.equal(issued.body.invoice.status, 'issued')
  assert.ok(issued.body.invoice.issued_at)
  const paid = await post(`/v1/billing/invoices/${id}/status`, { status: 'paid' }, session.accessToken)
  assert.equal(paid.body.invoice.status, 'paid')
  assert.ok(paid.body.invoice.paid_at)
})

test('another tenant cannot read or move the invoice', async () => {
  const owner = await register('inv-d')
  const outsider = await register('inv-e')
  const created = await post('/v1/billing/invoices', {}, owner.accessToken)
  const id = created.body.invoice.id

  const outsiderList = await get('/v1/billing/invoices', outsider.accessToken)
  assert.equal(outsiderList.status, 200)
  assert.equal(outsiderList.body.items.length, 0)

  const moved = await post(`/v1/billing/invoices/${id}/status`, { status: 'paid' }, outsider.accessToken)
  assert.equal(moved.status, 404)
})
