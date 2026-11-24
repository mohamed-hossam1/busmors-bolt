import test from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistry, type ToolDefinition, type ToolContext } from '../../src/server/employee/tool-registry.ts'
import { buildToolRegistry } from '../../src/server/employee/tools.ts'
import type { AgentRole } from '../../src/features/agents/contracts.ts'

function fakeServices() {
  const proposals: unknown[] = []
  return {
    proposals,
    services: {
      readBrain: async () => [{ id: 'b1', category: 'offering', title: 'Coffee', summary: '250g EGP 220', verificationState: 'owner_reported' }],
      proposeBrainChange: async (p: unknown) => { proposals.push(p); return { ok: true, id: 'prop-1', status: 'pending' } },
      readDeliverables: async () => [],
      readCalendar: async () => [],
      getTaskStatus: async () => ({ taskId: null, status: 'unknown', resultRefs: [], confirmed: false }),
      getProductKnowledge: async () => 'Busmora helps Egyptian businesses with marketing.',
      delegateToDirector: async () => ({ ok: true, taskId: 'task-1' }),
      createDeliverable: async () => ({ ok: true, id: 'd1', version: 1 }),
      createPostDraft: async () => ({ ok: true, id: 'p1' }),
      webSearch: async () => ({ ok: true as const, hits: [{ url: 'https://example.com', title: 'Example', snippet: 'snippet' }] }),
      scrapePage: async () => ({ ok: true as const, title: 'Example', markdown: '# Example', publishedAt: null }),
      composioRead: async () => ({ ok: true as const, data: {} }),
    },
  }
}

function ctx(): ToolContext {
  return { workspaceId: 'w1', instanceId: 'i1', services: fakeServices().services }
}

test('catalogForRole only exposes permitted tools', () => {
  const registry = buildToolRegistry(fakeServices().services)
  const orch = registry.catalogForRole('orchestrator').map((t) => t.name)
  assert.ok(orch.includes('read_business_brain'))
  assert.ok(orch.includes('propose_brain_change'))
  assert.ok(orch.includes('delegate_to_director'))
  assert.ok(orch.includes('get_product_knowledge'))
  assert.ok(orch.includes('get_task_status'))
  assert.equal(orch.includes('tavily_search'), false)
  const analyst = registry.catalogForRole('marketing_analyst').map((t) => t.name)
  assert.ok(analyst.includes('calculate'))
  assert.ok(analyst.includes('analyze_data'))
  assert.ok(analyst.includes('create_or_version_deliverable') === false)
})

test('execute enforces role allowlist', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('research', 'create_or_version_deliverable', { title: 'x', type: 'general', content: 'y' }, ctx())
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'forbidden')
})

test('execute validates required input', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('orchestrator', 'propose_brain_change', { change: 'add' }, ctx())
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'invalid_input')
})

test('execute runs read_business_brain and returns facts', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('orchestrator', 'read_business_brain', { query: 'coffee' }, ctx())
  assert.equal(result.ok, true)
  if (result.ok) {
    const facts = result.output as { title: string }[]
    assert.equal(facts[0].title, 'Coffee')
  }
})

test('propose_brain_change creates a pending proposal, never applies', async () => {
  const { services, proposals } = fakeServices()
  const registry = buildToolRegistry(services)
  const result = await registry.execute('orchestrator', 'propose_brain_change', {
    change: 'add', category: 'offering', title: 'New coffee', proposedValue: '350g EGP 300', source: 'chat', rationale: 'owner asked',
  }, { workspaceId: 'w1', instanceId: 'i1', services })
  assert.equal(result.ok, true)
  assert.equal(proposals.length, 1)
})

test('calculate tool preserves object values and computes relative_change', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const roas = await registry.execute('marketing_analyst', 'calculate', { formula: 'roas', values: { attributedValue: 8000, spend: 1600 } }, ctx())
  assert.equal(roas.ok, true)
  if (roas.ok) assert.equal((roas.output as { value: number }).value, 5)

  const rel = await registry.execute('marketing_analyst', 'calculate', { formula: 'relative_change', values: { previous: 32, next: 28 } }, ctx())
  assert.equal(rel.ok, true)
  if (rel.ok) assert.equal((rel.output as { value: number }).value, -12.5)
})

test('analyze_data preserves rows array argument through coerceArgs', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('marketing_analyst', 'analyze_data', {
    op: 'sum',
    column: 'clicks',
    rows: [{ clicks: 100 }, { clicks: 250 }],
  }, ctx())
  assert.equal(result.ok, true)
  if (result.ok) assert.equal((result.output as { sum: number }).sum, 350)
})

test('calculate tool returns a typed error for undefined denominator', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('marketing_analyst', 'calculate', { formula: 'roas', values: { attributedValue: 100, spend: 0 } }, ctx())
  assert.equal(result.ok, false)
})

test('external tools are wired to transports and return real (untrusted) hits', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('research', 'tavily_search', { query: 'coffee shops cairo' }, ctx())
  assert.equal(result.ok, true)
  if (result.ok) {
    const out = result.output as { provider: string; hits: { url: string }[] }
    assert.equal(out.provider, 'tavily')
    assert.ok(out.hits.length > 0)
  }
})

test('composio_read is not exposed to the director (no direct Composio access)', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('director', 'composio_read', { action: 'FACEBOOK_GET_PAGES' }, ctx())
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'forbidden')
})

test('external tools reject transport failure honestly (never pretend success)', async () => {
  const services = fakeServices().services
  services.webSearch = (async () => ({ ok: false, code: 'rate_limited', error: 'Tavily rate limit reached (HTTP 429).' })) as unknown as typeof services.webSearch
  const registry = buildToolRegistry(services)
  const result = await registry.execute('research', 'tavily_search', { query: 'x' }, { workspaceId: 'w1', instanceId: 'i1', services })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'unavailable')
})

test('unknown tool is rejected', async () => {
  const registry = new ToolRegistry([])
  const result = await registry.execute('director', 'nonexistent', {}, ctx())
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'not_implemented')
})

test('roles may not call orchestrator-only tools', async () => {
  const registry = buildToolRegistry(fakeServices().services)
  const result = await registry.execute('director', 'get_product_knowledge', {}, ctx())
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.code, 'forbidden')
})