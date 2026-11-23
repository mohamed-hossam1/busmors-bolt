// Disposable local PostgreSQL only (LOCAL_PG_URL, localhost). For each migration path
// (empty database, and upgrade from the legacy fixture) builds the schema in a fresh
// busmora_check_* database, runs every acceptance check, and drops the database.
// Exit codes: 0 pass, 1 a migration or check failed, 2 setup problem.
import { SetupError, buildSchema, localConnection, logPath, redact, runFile, say, withDisposableDb } from './local-pg.mjs'

const checks = [
  'competition-db-check.sql',
  'intake-db-check.sql',
  'brain-governance-db-check.sql',
  'task-execution-db-check.sql',
  'deliverable-db-check.sql',
  'discovery-db-check.sql',
  'planned-posts-db-check.sql',
  'deliverable-offer-db-check.sql',
  'roadmap-generation-db-check.sql',
  'post-proposed-time-db-check.sql',
  'facebook-connection-db-check.sql',
]

const conn = localConnection()
let code = 0
try {
  for (const mode of ['empty', 'upgrade']) {
    withDisposableDb(conn, (db) => {
      try {
        buildSchema(conn, db, mode)
        for (const check of checks) runFile(conn, db, 'scripts/' + check)
      } catch (error) {
        if (error instanceof SetupError) throw error
        say(`FAIL: ${mode} at ${error.file ?? 'unknown file'}`, process.stderr)
        say(redact(error.message), process.stderr)
        code = 1
        return
      }
      say(`PASS: ${mode} migration path and database acceptance checks`)
    })
    if (code) break
  }
} catch (error) {
  say(redact(error.message), process.stderr)
  code = error instanceof SetupError ? 2 : 1
}
say(`Full log: ${logPath}`)
process.exit(code)
