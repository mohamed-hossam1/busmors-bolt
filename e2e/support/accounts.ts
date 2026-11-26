import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadE2EEnv } from './env'
import { runSql, sqlLiteral } from './database'
import { registerAccount, type TestAccountRecord } from './runtime'

export interface TestAccount extends TestAccountRecord { client: SupabaseClient }

let phoneSeq = Math.floor(Math.random() * 1000)

export function newPhone(): string {
  phoneSeq = (phoneSeq + 1) % 100_000_000
  return `+2010${phoneSeq.toString().padStart(8, '0')}`
}

export function newCredentials(label: string) {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const domain = loadE2EEnv().emailDomain
  return { email: `busmora-e2e-${label}-${run}@${domain}`, password: `E2e!${crypto.randomUUID()}aA9` }
}

export function createPromoCode(label: string, heavyTasksLimit = 6): string {
  const sanitized = label.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'CODE'
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  const code = `BUSM-E2E-${sanitized}-${random}`.slice(0, 64)
  runSql(`INSERT INTO promo_codes(code, heavy_tasks_limit) VALUES (${sqlLiteral(code)}, ${heavyTasksLimit})`)
  return code
}

export function anonymousClient() {
  const env = loadE2EEnv()
  return createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

function serviceClient(): SupabaseClient {
  const env = loadE2EEnv()
  if (!env.serviceRoleKey) {
    throw new Error('Missing service role key (E2E_SUPABASE_SECRET_KEY/E2E_SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY) required to provision invite-only promo accounts.')
  }
  return createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function createAccount(label: string, completeOnboarding = false): Promise<TestAccount> {
  const admin = serviceClient()
  const { email, password } = newCredentials(label)
  const phone = newPhone()
  const promoCode = createPromoCode(label)
  const reservationToken = crypto.randomUUID()

  const reserved = await admin.rpc('reserve_promo_signup', { p_code: promoCode, p_phone: phone, p_reservation_token: reservationToken })
  if (reserved.error || !reserved.data?.ok) {
    throw new Error(`Promo reservation failed: ${reserved.error?.message ?? reserved.data?.errorCode ?? 'unknown'}`)
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { phone_number: phone } })
  if (created.error || !created.data.user) {
    await admin.rpc('release_promo_signup', { p_code: promoCode, p_reservation_token: reservationToken })
    throw new Error(`Admin user creation failed: ${created.error?.message ?? 'no user returned'}`)
  }
  const id = created.data.user.id

  const finalized = await admin.rpc('finalize_promo_signup', { p_user_id: id, p_code: promoCode, p_phone: phone, p_email: email, p_reservation_token: reservationToken })
  if (finalized.error || !finalized.data?.ok) {
    await admin.auth.admin.deleteUser(id)
    await admin.rpc('release_promo_signup', { p_code: promoCode, p_reservation_token: reservationToken })
    throw new Error(`Promo finalize failed: ${finalized.error?.message ?? finalized.data?.errorCode ?? 'unknown'}`)
  }

  const client = await signInClient({ label, id, email, password })
  registerAccount({ label, id, email, password })
  const account: TestAccount = { label, id, email, password, client }
  if (completeOnboarding) await confirmManualBusiness(account)
  return account
}

export async function signInClient(account: TestAccountRecord): Promise<SupabaseClient> {
  const client = anonymousClient()
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password })
  if (error) throw new Error(`E2E sign-in failed: ${error.message}`)
  return client
}

export async function confirmManualBusiness(account: TestAccount) {
  const form = {
    name: 'Orbit Ceramic Repairs',
    description: 'Orbit restores treasured ceramics with visible kintsugi-inspired repairs for owners in Cairo.',
    country: 'Egypt',
    serviceArea: 'Cairo with nationwide courier return',
    conversionRoute: { state: 'ready', type: 'website', value: 'https://example.com/book' },
    offerings: [{
      id: crypto.randomUUID(), name: 'Kintsugi restoration',
      description: 'A careful repair service for sentimental bowls and vases.',
      pricingModel: 'quote_required', amount: null, currency: null,
    }],
    tone: 'Warm, precise, and reassuring',
  }
  const saved = await account.client.rpc('save_business_draft', { p_form: form, p_expected_version: 0, p_path: 'manual', p_field_sources: {} })
  if (saved.error) throw new Error(`Business draft setup failed: ${saved.error.message}`)
  const confirmed = await account.client.rpc('confirm_business_draft', { p_draft_id: saved.data.id, p_expected_version: saved.data.version })
  if (confirmed.error) throw new Error(`Business confirmation failed: ${confirmed.error.message}`)
}