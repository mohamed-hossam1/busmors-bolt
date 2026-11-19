import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadE2EEnv } from './env'
import { registerAccount, type TestAccountRecord } from './runtime'

export interface TestAccount extends TestAccountRecord { client: SupabaseClient }

export function newCredentials(label: string) {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`
  const domain = loadE2EEnv().emailDomain
  return { email: `busmora-e2e-${label}-${run}@${domain}`, password: `E2e!${crypto.randomUUID()}aA9` }
}

export function anonymousClient() {
  const env = loadE2EEnv()
  return createClient(env.supabaseUrl, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function createAccount(label: string, completeOnboarding = false): Promise<TestAccount> {
  const auth = anonymousClient()
  const { email, password } = newCredentials(label)
  const { data, error } = await auth.auth.signUp({ email, password })
  if (error) throw new Error(`Real account registration failed: ${error.message}`)
  if (!data.user || !data.session) throw new Error('Registration did not return a session. Disable email confirmation in the disposable E2E project.')
  const client = createClient(loadE2EEnv().supabaseUrl, loadE2EEnv().anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const account = { label, id: data.user.id, email, password, client }
  registerAccount({ label, id: data.user.id, email, password })
  const bootstrap = await client.rpc('bootstrap_workspace')
  if (bootstrap.error) throw new Error(`Workspace bootstrap failed: ${bootstrap.error.message}`)
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
