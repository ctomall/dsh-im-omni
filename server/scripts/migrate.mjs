#!/usr/bin/env node
/**
 * Apply SQL migrations in filename order, recording each one in
 * `schema_migrations`. Runs against DATABASE_URL.
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'migrations')
const url = process.env.DATABASE_URL ?? 'postgresql://im_omni_owner:owner_dev_pw@127.0.0.1:5432/im_omni_dev'

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  for (const file of files) {
    const done = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file])
    if (done.rowCount > 0) {
      console.log(`skip ${file}`)
      continue
    }
    const sql = await readFile(join(dir, file), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`applied ${file}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
} finally {
  await client.end()
}
