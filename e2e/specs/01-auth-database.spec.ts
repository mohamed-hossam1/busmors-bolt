import { test, expect, type Page } from 'playwright/test'
import { createAccount, newCredentials, newPhone, createPromoCode, signInClient } from '../support/accounts'
import { registerThroughUi, waitForHydration, PROMO_LABEL, PHONE_LABEL, GOOGLE_BUTTON_LABEL } from '../support/browser'
import { queryRows, sqlLiteral } from '../support/database'
import { loadE2EEnv } from '../support/env'
import { registerAccount, accountByLabel } from '../support/runtime'
import { poll } from '../support/poll'

async function expectSignupRejected(page: Page, opts: { promoCode: string; email: string; password: string; phone: string }) {
  await page.goto(`/signup?promo=${encodeURIComponent(opts.promoCode)}`, { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await expect(page.getByLabel(PROMO_LABEL)).toHaveValue(opts.promoCode, { timeout: 15_000 })
  await page.getByLabel('Email').fill(opts.email)
  await page.getByLabel(PHONE_LABEL).fill(opts.phone)
  await page.getByLabel('Password').fill(opts.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 20_000 })
  await expect(page).toHaveURL(/\/signup(?:\?|$)/)
}

test('registration creates a real identity, workspace and settings, and protects unfinished onboarding', async ({ page }) => {
  await page.goto('/employee')
  await expect(page).toHaveURL(/\/signin\?next=%2Femployee$/)

  const credentials = newCredentials('browser-registration')
  const phone = newPhone()
  const promoCode = createPromoCode('browser-registration')
  await registerThroughUi(page, { email: credentials.email, password: credentials.password, phone, promoCode, viaQrUrl: true })
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

test('QR signup auto-fills promo, registers with phone, persists workspace_access, and rejects reuse', async ({ page, browser }) => {
  // Google OAuth is hidden during the invite-only beta on both auth screens.
  await page.goto('/signin', { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await expect(page.getByRole('button', { name: GOOGLE_BUTTON_LABEL })).toHaveCount(0)
  await page.goto('/signup', { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await expect(page.getByRole('button', { name: GOOGLE_BUTTON_LABEL })).toHaveCount(0)

  const promoCode = createPromoCode('qr-reuse')
  const phone = newPhone()
  const credentials = newCredentials('qr-reuse')
  await registerThroughUi(page, { email: credentials.email, password: credentials.password, phone, promoCode, viaQrUrl: true })

  const client = await signInClient({ ...credentials, id: '', label: 'qr-reuse' })
  const { data: identity } = await client.auth.getUser()
  expect(identity.user).toBeTruthy()
  const id = identity.user!.id
  registerAccount({ ...credentials, id, label: 'qr-reuse' })

  const access = await poll(async () => queryRows<{ phone_number: string; heavy_tasks_limit: number; heavy_tasks_used: number }>(
    `SELECT phone_number, heavy_tasks_limit, heavy_tasks_used FROM public.workspace_access WHERE workspace_id=${sqlLiteral(id)}`
  )[0], row => Boolean(row?.phone_number), 30_000)
  expect(access).toMatchObject({ phone_number: phone, heavy_tasks_limit: 6, heavy_tasks_used: 0 })

  const promo = await poll(async () => queryRows<{ status: string }>(
    `SELECT status FROM public.promo_codes WHERE code=${sqlLiteral(promoCode)}`
  )[0], row => row?.status === 'redeemed', 30_000)
  expect(promo?.status).toBe('redeemed')

  const phones = queryRows<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.workspace_access WHERE phone_number=${sqlLiteral(phone)}`
  )[0]
  expect(phones?.n).toBe(1)

  const baseURL = loadE2EEnv().baseUrl

  // Reusing the already-redeemed promo code with a fresh email + phone is rejected in the UI.
  const reuseCtx = await browser.newContext({ baseURL })
  try {
    const reusePage = await reuseCtx.newPage()
    const reuseCreds = newCredentials('qr-reuse-dup')
    await expectSignupRejected(reusePage, { promoCode, email: reuseCreds.email, password: reuseCreds.password, phone: newPhone() })
    const dupUser = queryRows<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth.users WHERE email=${sqlLiteral(reuseCreds.email)}`
    )[0]
    expect(dupUser?.n).toBe(0)
    const dupPromo = queryRows<{ status: string; redeemed_by_workspace_id: string | null }>(
      `SELECT status, redeemed_by_workspace_id FROM public.promo_codes WHERE code=${sqlLiteral(promoCode)}`
    )[0]
    expect(dupPromo?.status).toBe('redeemed')
    expect(dupPromo?.redeemed_by_workspace_id).toBe(id)
  } finally {
    await reuseCtx.close()
  }

  // A fresh promo code reusing the SAME phone is rejected; workspace_access stays at a single row.
  const freshPromo = createPromoCode('qr-reuse-phone')
  const phoneCtx = await browser.newContext({ baseURL })
  try {
    const phonePage = await phoneCtx.newPage()
    const phoneCreds = newCredentials('qr-reuse-phone')
    await expectSignupRejected(phonePage, { promoCode: freshPromo, email: phoneCreds.email, password: phoneCreds.password, phone })
    const phoneCount = queryRows<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.workspace_access WHERE phone_number=${sqlLiteral(phone)}`
    )[0]
    expect(phoneCount?.n).toBe(1)
    const freshPromoRow = queryRows<{ status: string }>(
      `SELECT status FROM public.promo_codes WHERE code=${sqlLiteral(freshPromo)}`
    )[0]
    expect(freshPromoRow?.status).toBe('active')
  } finally {
    await phoneCtx.close()
  }
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
  const confirmed = await account.client.rpc('confirm_business_draft', { p_draft_id: updated.data.id, p_expected_version: updated.data.version })
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

  const forged = await intruderClient.from('brain_nodes').insert({ workspace_id: primary.id, category: 'offering', title: 'Foreign fact' }).select()
  expect(forged.error).toBeTruthy()
  const primaryClient = await signInClient(primary)
  const primaryRows = await primaryClient.from('brain_nodes').select('id').eq('workspace_id', primary.id)
  expect(primaryRows.data!.length).toBeGreaterThan(0)
})