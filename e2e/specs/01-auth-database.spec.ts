import { test, expect } from 'playwright/test'
import { createAccount, newCredentials, signInClient } from '../support/accounts'
import { registerThroughUi } from '../support/browser'
import { queryRows, sqlLiteral } from '../support/database'
import { registerAccount, accountByLabel } from '../support/runtime'
import { poll } from '../support/poll'

test('registration creates a real identity, workspace and settings, and protects unfinished onboarding', async ({ page }) => {
  await page.goto('/employee')
  await expect(page).toHaveURL(/\/signin\?next=%2Femployee$/)

  const credentials = newCredentials('browser-registration')
  await registerThroughUi(page, credentials.email, credentials.password)
  const client = await signInClient({ ...credentials, id: '', label: 'browser-registration' })
  const { data: identity } = await client.auth.getUser()
  expect(identity.user).toBeTruthy()
  const id = identity.user!.id
  registerAccount({ ...credentials, id, label: 'browser-registration' })

  const persisted = await poll(async () => queryRows<{
    user_id: string; email: string; workspace_id: string | null; settings_id: string | null; onboarding_state: string | null
  }>(`SELECT u.id AS user_id,u.email,w.id AS workspace_id,s.workspace_id AS settings_id,s.onboarding_state
      FROM auth.users u LEFT JOIN public.workspaces w ON w.id=u.id
      LEFT JOIN public.workspace_settings s ON s.workspace_id=u.id
      WHERE u.id=${sqlLiteral(id)}`)[0], row => Boolean(row?.settings_id), 30_000)

  expect(persisted).toMatchObject({ user_id: id, email: credentials.email, workspace_id: id, settings_id: id, onboarding_state: 'awaiting_url' })
  await page.goto('/employee')
  await expect(page).toHaveURL(/\/onboarding$/)
})

test('business confirmation is atomic and creates versioned, audited relationships', async () => {
  const account = await createAccount('transaction')
  const invalid = {
    name: 'Atomic Studio', description: '', country: 'Egypt', serviceArea: 'Cairo',
    offerings: [{ id: crypto.randomUUID(), name: 'Repair', description: '', pricingModel: 'quote_required', amount: null, currency: null }],
    conversionRoute: { state: 'not_ready' },
  }
  const saved = await account.client.rpc('save_business_draft', { p_form: invalid, p_expected_version: 0, p_path: 'manual', p_field_sources: {} })
  expect(saved.error).toBeNull()
  const rejected = await account.client.rpc('confirm_business_draft', { p_draft_id: saved.data.id, p_expected_version: saved.data.version })
  expect(rejected.error?.message).toContain('INVALID_BUSINESS')

  const beforeNodes = await account.client.from('brain_nodes').select('id')
  const beforeSettings = await account.client.from('workspace_settings').select('onboarding_state,confirmed_intake_version').single()
  expect(beforeNodes.data).toEqual([])
  expect(beforeSettings.data).toMatchObject({ onboarding_state: 'awaiting_url', confirmed_intake_version: null })

  const valid = { ...invalid, description: 'Repairs sentimental ceramics without hiding uncertainty.' }
  const updated = await account.client.rpc('save_business_draft', { p_form: valid, p_expected_version: saved.data.version, p_path: 'manual', p_field_sources: {} })
  expect(updated.error).toBeNull()
  const confirmed = await account.client.rpc('confirm_business_draft', { p_draft_id: saved.data.id, p_expected_version: updated.data.version })
  expect(confirmed.error).toBeNull()

  const [nodes, versions, audit, settings] = await Promise.all([
    account.client.from('brain_nodes').select('*'),
    account.client.from('brain_versions').select('*'),
    account.client.from('audit_log').select('*').eq('action', 'business_confirmed'),
    account.client.from('workspace_settings').select('*').single(),
  ])
  expect(nodes.data).toHaveLength(2)
  expect(versions.data).toHaveLength(2)
  expect(new Set(versions.data!.map(row => row.node_id))).toEqual(new Set(nodes.data!.map(row => row.id)))
  expect(audit.data).toHaveLength(1)
  expect(settings.data).toMatchObject({ onboarding_state: 'complete', confirmed_intake_version: updated.data.version, country: 'Egypt' })
})

test('RLS prevents cross-workspace reads and relationship forgery', async () => {
  const primary = accountByLabel('primary')
  const intruder = accountByLabel('intruder')
  const intruderClient = await signInClient(intruder)
  const hidden = await intruderClient.from('brain_nodes').select('*').eq('workspace_id', primary.id)
  expect(hidden.error).toBeNull()
  expect(hidden.data).toEqual([])

  const forged = await intruderClient.from('conversations').insert({ workspace_id: primary.id, title: 'Foreign conversation' }).select()
  expect(forged.error).toBeTruthy()
  const primaryClient = await signInClient(primary)
  const primaryRows = await primaryClient.from('brain_nodes').select('id').eq('workspace_id', primary.id)
  expect(primaryRows.data!.length).toBeGreaterThan(0)
})
