#!/usr/bin/env node
// Runs one self-contained .sql check in a disposable database on the local Supabase PostgreSQL from DATABASE_URL.
// Refuses any non-localhost host so the shared/hosted project is never touched.
// Usage: node scripts/db-check.cjs <sql-file>
// Exit codes: 0 pass, 1 a migration or check failed, 2 setup problem.
const path = require('node:path')

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node scripts/db-check.cjs <sql-file>')
    process.exit(2)
  }
  const pg = await import('./local-pg.mjs')
  const rel = path.relative(pg.repoRoot, path.resolve(file)).split(path.sep).join('/')
  const conn = pg.localConnection()
  let code = 0
  try {
    pg.withDisposableDb(conn, (db) => {
      try {
        pg.buildSchema(conn, db, 'empty')
        pg.runFile(conn, db, rel)
      } catch (error) {
        if (error instanceof pg.SetupError) throw error
        pg.say(`FAIL: ${rel}${error.file && error.file !== rel ? ` (at ${error.file})` : ''}`, process.stderr)
        pg.say(pg.redact(error.message), process.stderr)
        code = 1
        return
      }
      pg.say(`PASS: ${rel}`)
    })
  } catch (error) {
    pg.say(pg.redact(error.message), process.stderr)
    code = error instanceof pg.SetupError ? 2 : 1
  }
  pg.say(`Full log: ${pg.logPath}`)
  process.exit(code)
}

main()
