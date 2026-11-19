#!/usr/bin/env node
// Runs a self-contained .sql check against DATABASE_URL (hosted Supabase/Postgres).
// Usage: node scripts/db-check.cjs <path-to-sql>
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/db-check.cjs <sql-file>')
  process.exit(2)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(2)
}
try {
  const out = execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', path.resolve(file)], {
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (out) process.stdout.write(out)
} catch {
  process.exit(1)
}