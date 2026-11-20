import { existsSync } from 'node:fs'

let loaded = false

function loadLocalEnv() {
  if (loaded) return
  loaded = true
  if (existsSync('.env')) {
    try { process.loadEnvFile('.env') } catch { /* Explicit E2E variables still work. */ }
  }
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? (fallback ? process.env[fallback] : undefined)
  if (!value) throw new Error(`Missing ${name}. Configure a disposable real E2E environment; mocked services are not supported.`)
  return value
}

export interface E2EEnv {
  supabaseUrl: string
  anonKey: string
  serviceRoleKey?: string
  databaseUrl: string
  baseUrl: string
  aiApiKey?: string
  aiProvider?: string
  aiModel?: string
  firecrawlApiKey?: string
  emailDomain: string
  allowRemote: boolean
}

export function loadE2EEnv(): E2EEnv {
  loadLocalEnv()
  return {
    supabaseUrl: required('E2E_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, ''),
    anonKey: required('E2E_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: process.env.E2E_SUPABASE_SECRET_KEY ?? process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: required('E2E_DATABASE_URL', 'DATABASE_URL'),
    baseUrl: (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4179').replace(/\/$/, ''),
    aiApiKey: process.env.E2E_AI_API_KEY ?? process.env.AI_API_KEY,
    aiProvider: process.env.E2E_AI_PROVIDER ?? process.env.AI_PROVIDER,
    aiModel: process.env.E2E_AI_MODEL ?? process.env.AI_MODEL,
    firecrawlApiKey: process.env.E2E_FIRECRAWL_API_KEY ?? process.env.FIRECRAWL_API_KEY,
    emailDomain: process.env.E2E_EMAIL_DOMAIN ?? 'example.com',
    allowRemote: process.env.E2E_ALLOW_REMOTE === '1',
  }
}

export function assertSafeEnvironment(env = loadE2EEnv()) {
  const host = new URL(env.supabaseUrl).hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!local && !env.allowRemote) {
    throw new Error(`Refusing remote Supabase host ${host}. Use a disposable project and explicitly set E2E_ALLOW_REMOTE=1.`)
  }
  if (!local) {
    const projectRef = host.split('.')[0]
    const database = new URL(env.databaseUrl)
    if (!database.username.includes(projectRef) && !database.hostname.includes(projectRef)) {
      throw new Error('E2E_DATABASE_URL does not appear to belong to E2E_SUPABASE_URL; refusing cleanup against a different project.')
    }
  }
  if (!env.aiApiKey) throw new Error('Missing E2E_AI_API_KEY/AI_API_KEY: real agent tests never substitute model responses.')
  return env
}
