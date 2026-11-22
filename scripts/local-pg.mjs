// Shared helper for the local database checks (npm run test:db:local / test:posts:db).
// Connects ONLY to the local PostgreSQL named by LOCAL_PG_URL (localhost only) and only
// ever creates/drops disposable busmora_check_* databases. Never reads DATABASE_URL.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const logDir = path.join(os.tmpdir(), 'busmora-db-check')
mkdirSync(logDir, { recursive: true })
export const logPath = path.join(logDir, 'acceptance-' + new Date().toISOString().replace(/:/g, '-') + '.log')

/** A setup problem (configuration, psql, connection): runners exit 2. */
export class SetupError extends Error {}

const secrets = []

/** Replaces the password and the full LOCAL_PG_URL with ***. */
export function redact(text) {
  let out = String(text ?? '')
  for (const secret of secrets) if (secret) out = out.split(secret).join('***')
  return out
}

export function log(text) {
  appendFileSync(logPath, redact(text))
}

/** Prints a redacted line to the console and the log. */
export function say(line, stream = process.stdout) {
  const clean = redact(line)
  stream.write(clean + '\n')
  log(clean + '\n')
}

function parseEnvFile(file) {
  const values = {}
  if (!existsSync(file)) return values
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    if (key !== 'LOCAL_PG_URL' && key !== 'PSQL') continue
    let value = line.slice(eq + 1).trim()
    const quoted = value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]
    if (quoted) value = value.slice(1, -1)
    else {
      const hash = value.indexOf(' #')
      if (hash >= 0) value = value.slice(0, hash).trim()
    }
    values[key] = value
  }
  return values
}

/** Reads LOCAL_PG_URL and PSQL from the environment, else from .env. Nothing else. */
export function loadLocalEnv() {
  const file = parseEnvFile(path.join(repoRoot, '.env'))
  const pick = (key) => (process.env[key] !== undefined ? process.env[key] : file[key])
  return { LOCAL_PG_URL: pick('LOCAL_PG_URL'), PSQL: pick('PSQL') }
}

function setupExit(message) {
  console.error(message)
  process.exit(2)
}

/** Parses LOCAL_PG_URL and refuses anything that is not localhost. */
export function localConnection() {
  const env = loadLocalEnv()
  const raw = (env.LOCAL_PG_URL ?? '').trim()
  if (!raw) setupExit('LOCAL_PG_URL is not set. See .env.example.')
  secrets.push(raw)
  let url
  try {
    url = new URL(raw)
  } catch {
    setupExit('LOCAL_PG_URL could not be parsed. URL-encode special characters in the password.')
  }
  if (url.password) secrets.push(url.password)
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') setupExit('LOCAL_PG_URL must start with postgresql://.')
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) {
    setupExit('LOCAL_PG_URL must point to localhost. Refusing to run.')
  }
  let user, password
  try {
    user = decodeURIComponent(url.username)
    password = decodeURIComponent(url.password)
  } catch {
    setupExit('LOCAL_PG_URL could not be parsed. URL-encode special characters in the password.')
  }
  if (password) secrets.push(password)
  const host = url.hostname === '[::1]' ? '::1' : url.hostname
  return { host, port: url.port || '5432', user, password, adminDb: decodeURIComponent(url.pathname.slice(1)) || 'postgres', psql: env.PSQL }
}

let psqlPath
function findPsql(conn) {
  if (psqlPath) return psqlPath
  const works = (cmd) => {
    const result = spawnSync(cmd, ['--version'], { encoding: 'utf8' })
    return !result.error && result.status === 0
  }
  const fallback = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe'
  const candidates = [conn.psql?.trim(), 'psql', existsSync(fallback) ? fallback : null].filter(Boolean)
  psqlPath = candidates.find(works)
  if (!psqlPath) {
    throw new SetupError('psql not found. Add C:\\Program Files\\PostgreSQL\\17\\bin to PATH or set PSQL in .env.')
  }
  return psqlPath
}

/** Runs psql on a local database. The connection goes only through PG* env vars. */
export function runPsql(conn, db, args) {
  const psql = findPsql(conn)
  const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      PGHOST: conn.host,
      PGPORT: conn.port,
      PGUSER: conn.user,
      PGPASSWORD: conn.password,
      PGCONNECT_TIMEOUT: '10',
      PGCLIENTENCODING: 'UTF8',
    },
  })
  log((result.stdout ?? '') + (result.stderr ?? ''))
  if (result.error || result.status !== 0) {
    const detail = result.error ? String(result.error.message) : (result.stderr ?? '')
    throw new Error(redact(detail.slice(-4000)))
  }
  return result.stdout ?? ''
}

const dbName = /^busmora_check_[0-9a-f]{12}$/

function assertName(name) {
  if (!dbName.test(name)) throw new SetupError('Refusing to use an unexpected database name.')
}

/** Creates an empty disposable database. A failure here is a setup/connection problem. */
export function createDisposableDb(conn) {
  const name = 'busmora_check_' + randomBytes(6).toString('hex')
  assertName(name)
  try {
    runPsql(conn, conn.adminDb, ['-c', `CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`])
  } catch (error) {
    if (error instanceof SetupError) throw error
    throw new SetupError('Cannot create a disposable database on the local PostgreSQL:\n' + error.message)
  }
  return name
}

export function dropDisposableDb(conn, name) {
  assertName(name)
  runPsql(conn, conn.adminDb, ['-c', `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`])
}

/** Creates a disposable database, runs fn(name), and always drops it (also on Ctrl+C). */
export function withDisposableDb(conn, fn) {
  const name = createDisposableDb(conn)
  const onInterrupt = () => {
    try {
      dropDisposableDb(conn, name)
    } finally {
      process.exit(130)
    }
  }
  process.once('SIGINT', onInterrupt)
  try {
    return fn(name)
  } finally {
    process.removeListener('SIGINT', onInterrupt)
    dropDisposableDb(conn, name)
  }
}

/** Runs one repo-relative .sql file; a failure carries the file name in error.file. */
export function runFile(conn, db, relativePath) {
  const rel = relativePath.split(path.sep).join('/')
  if (!existsSync(path.join(repoRoot, rel))) {
    const error = new Error(`File not found: ${rel}`)
    error.file = rel
    throw error
  }
  try {
    runPsql(conn, db, ['-f', rel])
  } catch (error) {
    if (!(error instanceof SetupError)) error.file = rel
    throw error
  }
}

/** Bootstrap stubs + every migration in file-name order; 'upgrade' adds the legacy fixture and assert. */
export function buildSchema(conn, db, mode) {
  if (mode !== 'empty' && mode !== 'upgrade') throw new Error('Unknown mode: ' + mode)
  runFile(conn, db, 'scripts/local-db-bootstrap.sql')
  const migrations = readdirSync(path.join(repoRoot, 'supabase', 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const name of migrations) {
    if (mode === 'upgrade' && name.startsWith('20261118020000')) runFile(conn, db, 'scripts/migration-upgrade-fixture.sql')
    runFile(conn, db, 'supabase/migrations/' + name)
  }
  if (mode === 'upgrade') runFile(conn, db, 'scripts/migration-upgrade-assert.sql')
}

/** First psql ERROR line of a failure message (already redacted). */
export function firstErrorLine(message) {
  return String(message).split(/\r?\n/).find((line) => line.includes('ERROR:')) ?? ''
}
