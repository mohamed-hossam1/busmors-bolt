import { test, expect } from 'playwright/test'
import { createAccount, type TestAccount } from '../support/accounts'
import { signIn, waitForHydration } from '../support/browser'
import { poll } from '../support/poll'
import { submitTask, taskEvidence } from '../support/tasks'

const normalize = (value: string) => value
  .normalize('NFKC').toLowerCase()
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1 ')
  .replace(/[#*_>`~|]/g, ' ').replace(/\s+/g, ' ').trim()

test('website onboarding rejects invalid targets, performs a real crawl, persists evidence, and exposes approved knowledge to the Director', async ({ page }) => {
  test.setTimeout(300_000)
  const account: TestAccount = await createAccount('crawl')
  const crawlTarget = 'https://www.iana.org/domains/reserved'
  await signIn(page, account)

  await page.goto('/employee')
  await expect(page).toHaveURL(/\/onboarding$/)
  await waitForHydration(page)
  const website = page.getByLabel(/Company website URL/i)

  await website.fill('not a website')
  await page.getByRole('button', { name: 'Build my Business Brain' }).click()
  await expect(page.locator('#website-error')).toContainText('valid website address')

  await website.fill('http://127.0.0.1:3000/private')
  await page.getByRole('button', { name: 'Build my Business Brain' }).click()
  await expect(page.locator('#website-error')).toBeVisible({ timeout: 30_000 })
  const afterPrivate = await account.client.from('brain_nodes').select('id')
  expect(afterPrivate.data).toEqual([])

  await website.fill(crawlTarget)
  await page.getByRole('button', { name: 'Build my Business Brain' }).click()
  await expect(page.getByRole('button', { name: 'Contact the Director' })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('button', { name: 'Select a Plan' })).toBeVisible()

  const [settings, nodes, sources, proposals, edges, audit] = await Promise.all([
    account.client.from('workspace_settings').select('*').single(),
    account.client.from('brain_nodes').select('*').order('created_at'),
    account.client.from('sources').select('*').eq('source_type', 'website'),
    account.client.from('brain_proposals').select('*').eq('status', 'pending'),
    account.client.from('brain_edges').select('*'),
    account.client.from('audit_log').select('*').eq('action', 'website_proposals_saved'),
  ])
  for (const response of [settings, nodes, sources, proposals, edges, audit]) expect(response.error).toBeNull()
  expect(settings.data.onboarding_state).toBe('complete')
  expect(settings.data.company_url).toBe(new URL(crawlTarget).toString())
  expect(Number(settings.data.crawl_status.pages_read)).toBeGreaterThan(0)
  expect(nodes.data!.length).toBeGreaterThan(0)
  expect(sources.data!.length).toBeGreaterThan(0)
  // Website intelligence is saved automatically as approved records; no client approval is required.
  expect(nodes.data!.every(node => node.status === 'approved' && node.approval_state === 'approved')).toBeTruthy()
  expect(audit.data).toHaveLength(1)

  const fetched = new Map<string, string>()
  for (const source of sources.data!) {
    if (!fetched.has(source.url)) {
      const response = await fetch(`https://r.jina.ai/${source.url}`, { headers: { Accept: 'text/plain' } })
      expect(response.ok, `reader should retrieve ${source.url}`).toBeTruthy()
      fetched.set(source.url, normalize(await response.text()))
    }
    const excerpt = normalize(source.excerpt)
    expect(excerpt.length).toBeGreaterThan(24)
    expect.soft(fetched.get(source.url), `persisted evidence must be an exact excerpt of ${source.url}`).toContain(excerpt)
  }

  const nodeIds = new Set(nodes.data!.map(node => node.id))
  for (const edge of edges.data!) {
    expect(edge.workspace_id).toBe(account.id)
    expect(nodeIds.has(edge.source_node_id)).toBeTruthy()
    expect(nodeIds.has(edge.target_node_id)).toBeTruthy()
    expect(edge.source_node_id).not.toBe(edge.target_node_id)
  }

  await page.goto('/brain')
  await waitForHydration(page)
  // Website intelligence is auto-approved, so it is already usable by the Director.
  const approved = await poll(
    async () => await account.client.from('brain_nodes').select('*').eq('approval_state', 'approved').limit(1).maybeSingle(),
    result => Boolean(result.data) || Boolean(result.error),
    30_000,
  )
  expect(approved.error).toBeNull()
  expect(approved.data, 'auto-approved knowledge must persist to the Brain').toBeTruthy()

  await page.goto('/employee')
  const request = `Using my approved Business Brain, summarize the fact titled "${approved.data!.title}" in one sentence.`
  const task = await submitTask(page, account.client, request)
  expect(task.status, task.result_summary ?? 'task did not complete').toBe('completed')
  const evidence = await taskEvidence(account.client, task.id)
  expect(evidence.result).toBeTruthy()
  expect(evidence.steps.some(step => step.agent === 'orchestrator')).toBeTruthy()
  const refs = (task.checkpoint.contextRefs ?? []) as { nodeId: string; version: number }[]
  expect(refs.some(ref => ref.nodeId === approved.data!.id && ref.version === approved.data!.version)).toBeTruthy()
  expect(task.result_summary?.toLowerCase()).toContain(String(approved.data!.title).split(/\s+/)[0].toLowerCase())
})
