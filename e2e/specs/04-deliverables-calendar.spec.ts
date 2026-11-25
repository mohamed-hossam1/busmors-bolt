import { test, expect } from 'playwright/test'
import { accountByLabel } from '../support/runtime'
import { signInClient } from '../support/accounts'
import { signIn, waitForHydration } from '../support/browser'
import { runSql, sqlLiteral } from '../support/database'
import { poll } from '../support/poll'

test('a generated document is saved, versioned, searchable, and rendered in Deliverables', async ({ page }) => {
  const account = accountByLabel('primary')
  const client = await signInClient(account)
  await signIn(page, account)
  const marker = `E2E-${crypto.randomUUID().slice(0, 8)}`
  const docId = crypto.randomUUID()
  const title = `Diagnosis report ${marker}`
  const content = `Observations and hypotheses for ${marker}.`
  runSql(`
    BEGIN;
    INSERT INTO public.deliverables(id, workspace_id, title, type, content, version)
    VALUES (${sqlLiteral(docId)}, ${sqlLiteral(account.id)}, ${sqlLiteral(title)}, 'performance_diagnosis', ${sqlLiteral(content)}, 1);
    INSERT INTO public.deliverable_versions(workspace_id, deliverable_id, version, title, content, provenance, source_refs, context_refs, limitations)
    VALUES (${sqlLiteral(account.id)}, ${sqlLiteral(docId)}, 1, ${sqlLiteral(title)}, ${sqlLiteral(content)}, '{"kind":"e2e"}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);
    COMMIT;
  `)
  const document = { id: docId, title, content }

  await page.goto('/deliverables')
  await waitForHydration(page)
  await page.getByPlaceholder('Search title or content').fill(marker)
  await expect(page.getByRole('heading', { name: document.title })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /View/ }).first().click()
  await expect(page.getByRole('dialog', { name: document.title })).toContainText(document.content.slice(0, 60))

  const version = await client.from('deliverable_versions').select('*').eq('deliverable_id', document.id).single()
  expect(version.error).toBeNull()
  expect(version.data).toMatchObject({ workspace_id: account.id, version: 1, title: document.title, content: document.content })
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

test('the background publisher claims a due approved Post and records the real integration outcome', async () => {
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
  expect(['published', 'failed']).toContain(outcome.post.status)
  expect(outcome.post.status === 'published' ? outcome.post.publish_result?.provider_post_id : outcome.attempts.at(-1)?.error_code).toBeTruthy()
})
