import { test, expect } from 'playwright/test'
import { accountByLabel } from '../support/runtime'
import { signInClient } from '../support/accounts'
import { signIn } from '../support/browser'
import { submitTask, taskEvidence } from '../support/tasks'

const primary = () => accountByLabel('primary')

test.beforeEach(async ({ page }) => {
  await signIn(page, primary())
  await page.goto('/employee')
})

test('orchestrator routes a simple grounded query to a direct answer', async ({ page }) => {
  const client = await signInClient(primary())
  const request = `In one sentence, what service does Orbit Ceramic Repairs offer? Request ${crypto.randomUUID()}.`
  const task = await submitTask(page, client, request)
  expect(task.status, task.result_summary ?? 'task did not complete').toBe('completed')
  expect(task.type).toBe('simple_answer')
  expect(task.result_summary?.toLowerCase()).toMatch(/orbit|ceramic|kintsugi|repair/)

  const evidence = await taskEvidence(client, task.id)
  expect(evidence.result).toBeTruthy()
  expect(evidence.steps.map(step => step.agent)).toContain('orchestrator')
  expect(evidence.events.some(event => event.event_type === 'agent_completed')).toBeTruthy()
  expect(evidence.usage.length).toBeGreaterThan(0)
})

test('content writer executes and persists exactly two grounded posts with immutable versions', async ({ page }) => {
  const client = await signInClient(primary())
  const request = `Write exactly 2 social posts about our Kintsugi restoration service. Do not invent prices. Request ${crypto.randomUUID()}.`
  const task = await submitTask(page, client, request)
  expect(task.status, task.result_summary ?? 'task did not complete').toBe('completed')
  expect(task.type).toBe('content_creation')

  const evidence = await taskEvidence(client, task.id)
  expect(evidence.steps.map(step => step.agent)).toContain('content_writer')
  expect(evidence.posts).toHaveLength(2)
  expect(evidence.result.output.postIds).toHaveLength(2)
  for (const post of evidence.posts) {
    expect(post.caption.length).toBeGreaterThan(40)
    expect(`${post.caption} ${post.hashtags}`.toLowerCase()).toMatch(/kintsugi|ceramic|repair|restor/)
    expect(post.caption).not.toMatch(/\b(?:EGP|USD|\$|€)\s?\d|\d+\s?(?:EGP|USD)/i)
    expect(post.status).toBe('draft')
  }
  const versions = await client.from('post_versions').select('*').in('post_id', evidence.posts.map(post => post.id))
  expect(versions.error).toBeNull()
  expect(versions.data).toHaveLength(2)
})

test('campaign planner creates a real brief and the requested post set', async ({ page }) => {
  const client = await signInClient(primary())
  const request = `Plan a focused campaign with exactly 3 posts for Orbit's Kintsugi restoration. Request ${crypto.randomUUID()}.`
  const task = await submitTask(page, client, request)
  expect(task.status, task.result_summary ?? 'task did not complete').toBe('completed')
  expect(task.type).toBe('campaign_planning')

  const evidence = await taskEvidence(client, task.id)
  expect(evidence.steps.map(step => step.agent)).toContain('campaign_planner')
  expect(evidence.posts).toHaveLength(3)
  expect(evidence.deliverables).toHaveLength(1)
  expect(evidence.deliverables[0].content.length).toBeGreaterThan(150)
  const versions = await client.from('deliverable_versions').select('*').eq('deliverable_id', evidence.deliverables[0].id)
  expect(versions.error).toBeNull()
  expect(versions.data).toHaveLength(1)
})

test('performance analyst produces a persisted diagnosis instead of a chat-only success', async ({ page }) => {
  const client = await signInClient(primary())
  const request = `Diagnose why inquiries for our ceramic repair service fell despite steady site visits. Separate evidence from hypotheses. Request ${crypto.randomUUID()}.`
  const task = await submitTask(page, client, request)
  expect(task.status, task.result_summary ?? 'task did not complete').toBe('completed')
  expect(task.type).toBe('performance_diagnosis')

  const evidence = await taskEvidence(client, task.id)
  expect(evidence.steps.map(step => step.agent)).toContain('performance')
  expect(evidence.deliverables).toHaveLength(1)
  expect(evidence.deliverables[0].type).toBe('performance_diagnosis')
  expect(evidence.deliverables[0].content.toLowerCase()).toMatch(/hypothes|evidence|observation|constraint/)
})

for (const scenario of [
  { agent: 'research_director', account: 'research_a', label: 'customer concerns', type: 'research_report', prompt: 'Research current public customer concerns about repairing sentimental ceramics in Egypt. Retrieve and cite real sources.' },
  { agent: 'research_director', account: 'research_b', label: 'competitors', type: 'research_report', prompt: 'Research and compare real ceramic restoration competitors serving Cairo. Retrieve and cite real sources.' },
]) {
  test(`${scenario.agent} retrieves sources for ${scenario.label} and saves an evidence-linked report`, async ({ page }) => {
    await signIn(page, accountByLabel(scenario.account))
    await page.goto('/employee')
    const client = await signInClient(accountByLabel(scenario.account))
    const request = `${scenario.prompt} Request ${crypto.randomUUID()}.`
    const task = await submitTask(page, client, request)
    expect(task.type).toBe('marketing_research')
    expect(task.research_mode).toBeTruthy()
    expect(task.status, task.result_summary ?? `${scenario.agent} did not complete`).toBe('completed')

    const evidence = await taskEvidence(client, task.id)
    expect(evidence.steps.map(step => step.agent)).toContain(scenario.agent)
    expect(evidence.deliverables).toHaveLength(1)
    expect(evidence.deliverables[0].type).toBe(scenario.type)
    const sources = await client.from('sources').select('*').eq('task_id', task.id)
    expect(sources.error).toBeNull()
    const retrieved = sources.data!.filter(source => source.availability === 'retrieved')
    expect(retrieved.length).toBeGreaterThan(1)
    for (const source of retrieved) {
      expect(new URL(source.url).protocol).toBe('https:')
      expect(source.excerpt.length).toBeGreaterThan(40)
      expect(source.provider).toBeTruthy()
      // Reachability is proven at capture time, not by re-fetching now: many
      // Egyptian and global sites block datacenter requests. The stored row is the
      // evidence that the page was opened and read by Firecrawl.
      expect(source.captured_at).toBeTruthy()
      expect(new Date(source.captured_at).getTime()).toBeGreaterThan(0)
    }
    const blocked = sources.data!.filter(source => source.availability !== 'retrieved')
    for (const source of blocked) {
      expect(source.excerpt).toBe('')
      expect(source.blocked_reason).toBeTruthy()
    }
    const claims = await client.from('claim_sources').select('*').eq('consumer_id', evidence.deliverables[0].id)
    expect(claims.error).toBeNull()
    expect(claims.data!.length).toBeGreaterThan(0)
    const sourceIds = new Set(sources.data!.map(source => source.id))
    expect(claims.data!.every(claim => sourceIds.has(claim.source_id))).toBeTruthy()
  })
}
