import { test, expect } from 'playwright/test'
import { createClient } from '@supabase/supabase-js'
import { accountByLabel } from '../support/runtime'
import { loadE2EEnv } from '../support/env'
import { signInClient } from '../support/accounts'
import { signIn, waitForHydration } from '../support/browser'
import { poll } from '../support/poll'

test('a saved document is versioned, searchable, and rendered in Deliverables', async ({ page }) => {
  const account = accountByLabel('primary')
  const client = await signInClient(account)
  const env = loadE2EEnv()
  if (!env.serviceRoleKey) throw new Error('E2E_SUPABASE_SERVICE_ROLE_KEY is required for the deterministic Deliverables fixture.')
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const marker = `E2E-${crypto.randomUUID().slice(0, 8)}`
  const title = `Diagnosis ${marker}`
  const content = `# Diagnosis ${marker}\n\nObservation: inquiries fell while visits held steady.\nHypothesis: the landing page lost the proof block.\nConstraint: no price changes were made.`

  // Deterministic fixture: the retired content/diagnosis execution path is gone,
  // so the Deliverables regression seeds a document through the service role
  // instead of asking an agent to generate one.
  const document = await admin.from('deliverables')
    .insert({ workspace_id: account.id, title, type: 'performance_diagnosis', content })
    .select('*').single()
  expect(document.error).toBeNull()
  const version = await admin.from('deliverable_versions')
    .insert({ workspace_id: account.id, deliverable_id: document.data.id, version: 1, title, content })
    .select('*').single()
  expect(version.error).toBeNull()

  await signIn(page, account)
  await page.goto('/deliverables')
  await waitForHydration(page)
  await page.getByPlaceholder('Search title or content').fill(marker)
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /View/ }).first().click()
  await expect(page.getByRole('dialog', { name: title })).toContainText(content.slice(0, 60))

  const stored = await client.from('deliverable_versions').select('*').eq('deliverable_id', document.data.id).single()
  expect(stored.error).toBeNull()
  expect(stored.data).toMatchObject({ workspace_id: account.id, version: 1, title, content })
})

test('a future scheduled Post persists its exact instant and appears in Calendar', async ({ page }) => {
  const account = accountByLabel('primary')
  const client = await signInClient(account)
  const marker = `Scheduled E2E ${crypto.randomUUID().slice(0, 8)}`
  const scheduledFor = new Date(Date.now() + 3 * 86_400_000).toISOString()
  const created = await client.rpc('create_post', {
    p_platform: 'facebook', p_caption: marker, p_hashtags: '#e2e', p_scheduled_for: scheduledFor,
    p_origin: { kind: 'e2e_schedule' }, p_visual_brief: '', p_idempotency_key: crypto.randomUUID(),
  })
  expect(created.error).toBeNull()
  const approved = await client.rpc('update_post', { p_ids: [created.data.id], p_expected_version: created.data.version, p_caption: null, p_status: 'approved' })
  expect(approved.error).toBeNull()

  await signIn(page, account)
  await page.goto('/scheduling')
  const card = page.locator('.card').filter({ hasText: marker })
  await expect(card).toBeVisible()
  await expect(card).toContainText(new Date(scheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))

  const stored = await client.from('planned_posts').select('*').eq('id', created.data.id).single()
  expect(stored.error).toBeNull()
  expect(new Date(stored.data.scheduled_for).toISOString()).toBe(scheduledFor)
  expect(stored.data.current_version_id).toBeTruthy()
  expect(stored.data.status, 'a Post with a future execution instant must enter the scheduled state').toBe('scheduled')
})

test('the background publisher records the isolated fake publishing outcome', async () => {
  test.skip(process.env.PUBLISHING_PROVIDER !== 'fake', 'publishing regression requires the isolated fake provider; never publish real Facebook content')
  test.setTimeout(90_000)
  const account = accountByLabel('primary')
  const client = await signInClient(account)
  const created = await client.rpc('create_post', {
    p_platform: 'facebook', p_caption: `Due E2E ${crypto.randomUUID()}`, p_hashtags: '',
    p_scheduled_for: new Date(Date.now() - 60_000).toISOString(), p_origin: { kind: 'e2e_due' },
    p_visual_brief: '', p_idempotency_key: crypto.randomUUID(),
  })
  expect(created.error).toBeNull()
  const approved = await client.rpc('update_post', { p_ids: [created.data.id], p_expected_version: created.data.version, p_caption: null, p_status: 'approved' })
  expect(approved.error).toBeNull()

  const outcome = await poll(async () => {
    const [post, attempts] = await Promise.all([
      client.from('planned_posts').select('*').eq('id', created.data.id).single(),
      client.from('publish_attempts').select('*').eq('post_id', created.data.id).order('created_at'),
    ])
    if (post.error || attempts.error) throw new Error(post.error?.message ?? attempts.error?.message)
    return { post: post.data, attempts: attempts.data ?? [] }
  }, value => value.attempts.length > 0 && !['approved', 'scheduled', 'publishing'].includes(value.post.status), 45_000, 3_000)

  expect(outcome.attempts.length, 'a deployed background job must record every due-post attempt').toBeGreaterThan(0)
  expect(outcome.post.status, 'the fake provider must not perform real publishing').toBe('published')
  expect(outcome.post.publish_result?.provider_post_id).toMatch(/^fake_/)
})
