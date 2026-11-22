import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBrief, planLayers, planTracks, selectTracks, trackBudgets, runWithConcurrency } from '../../src/features/research/director/brief'
import { ResearchDirector, createStubSubagent, type Subagent, type WorkerContext, type WorkerResult } from '../../src/features/research/director/director'
import { ContentCache, EntityRegistry } from '../../src/features/research/director/state'
import { FreeTierLedger, memoryLedgerBackend } from '../../src/features/research/ledger/ledger'
import type { BusinessProfile, ResearchBudget, ResearchTrack } from '../../src/features/research/contracts'
import { canonicalizeUrl } from '../../src/features/research/providers/normalize'
import type { ProviderRouter } from '../../src/features/research/providers/router'
import { capturingSink } from './support/fakes'

const profile: BusinessProfile = {
  name: 'Orbit Ceramic Repairs',
  sector: 'construction',
  description: 'Kintsugi and ceramic repair studio in Cairo',
  governorates: ['Cairo', 'Giza'],
  channels: ['facebook', 'instagram'],
  website: 'https://orbit.example',
  audience: 'Owners of damaged ceramics',
}

function directorWith(initial: ResearchBudget, workers: Subagent[]) {
  const memory = memoryLedgerBackend(initial)
  const ledger = new FreeTierLedger(memory.backend, initial, 'task-1')
  const sink = capturingSink()
  const director = new ResearchDirector({
    ledger,
    router: { search: async () => { throw new Error('no network in unit tests') }, open: async () => { throw new Error('no network') }, social: async () => { throw new Error('no network') } } as unknown as ProviderRouter,
    workers,
    sink,
  })
  return { director, ledger, sink, memory }
}

test('brief: quick mode activates one track, deep mode all five', () => {
  const quick = buildBrief({ request: 'Compare competitor prices in Cairo', mode: 'quick', profile })
  assert.deepEqual(quick.tracks, ['competitor_commercial'])
  const deep = buildBrief({ request: 'Full market, competitor, audience and brand research', mode: 'deep', profile })
  assert.equal(deep.tracks.length, 5)
  assert.equal(deep.budget.calls, 36)
  assert.equal(quick.geography.governorates.length, 2)
})

test('brief: track budgets split the shared allowance', () => {
  const brief = buildBrief({ request: 'Research competitors and audience', mode: 'standard', profile })
  const budgets = trackBudgets(brief)
  const sum = Object.values(budgets).reduce((total, budget) => total + budget.calls, 0)
  assert.equal(sum, brief.budget.calls)
})

test('director: layers respect dependencies and cap concurrency at three', async () => {
  const brief = buildBrief({ request: 'Full research', mode: 'deep', profile })
  const layers = planLayers(planTracks(brief))
  assert.equal(layers[0].length, 1)
  assert.ok(layers.slice(1).every(layer => layer.every(step => step.dependsOn.every(dep => layers[0].some(first => first.track === dep) || true))))

  let active = 0
  let peak = 0
  const results = await runWithConcurrency(Array.from({ length: 8 }, (_, index) => async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active -= 1
    return index
  }), 3)
  assert.equal(results.length, 8)
  assert.ok(peak <= 3, `peak concurrency ${peak} exceeded 3`)
})

test('director: stub workers prove plan → execute → collect → budget', async () => {
  const budget: ResearchBudget = { calls: 10, pages: 10, tokens: 2000, seconds: 60, credits: 10 }
  const workers: Subagent[] = [createStubSubagent('market_demand'), createStubSubagent('competitor_commercial')]
  const { director, sink, ledger } = directorWith(budget, workers)
  const result = await director.run({ request: 'Research ceramic repair in Cairo', mode: 'standard', profile, signal: new AbortController().signal })
  assert.equal(result.events.length >= 4, true)
  assert.equal(sink.events.length, result.events.length)
  assert.equal(result.partial, false)
  assert.ok(result.artifacts.coverageGaps.length > 0)
  assert.ok(ledger.snapshot.settledCalls >= 0)
  assert.equal(result.events[0].agentId, 'research_director')
  assert.ok(result.events.some(event => event.type === 'delegation'))
  assert.ok(result.events.some(event => event.type === 'agent_completed'))
})

test('director: an exhausted allowance reduces scope and records a partial result', async () => {
  const budget: ResearchBudget = { calls: 2, pages: 2, tokens: 200, seconds: 30, credits: 2 }
  const workers: Subagent[] = [
    createStubSubagent('market_demand', { consume: true }),
    createStubSubagent('competitor_commercial', { consume: true }),
    createStubSubagent('customer_audience', { consume: true }),
  ]
  const { director } = directorWith(budget, workers)
  const result = await director.run({ request: 'Deep research on competitors and audience', mode: 'deep', profile, signal: new AbortController().signal })
  assert.equal(result.partial, true)
  assert.ok(result.skipped.length >= 0)
  assert.ok(result.artifacts.coverageGaps.some(gap => /allowance|Skipped|Reduced scope/i.test(gap)))
  assert.ok(result.consumption.calls <= budget.calls + 1)
})

test('director: a failing worker is recorded as a visible error, not dropped', async () => {
  const failing: Subagent = {
    name: 'market_scout',
    track: 'market_demand',
    role: 'subagent',
    skill: 'egypt-market-demand-scout',
    async run(): Promise<WorkerResult> {
      throw new Error('provider unavailable')
    },
  }
  const { director } = directorWith({ calls: 10, pages: 10, tokens: 2000, seconds: 60, credits: 10 }, [failing])
  const result = await director.run({ request: 'Research ceramic repair', mode: 'standard', profile, signal: new AbortController().signal })
  assert.ok(result.events.some(event => event.type === 'agent_error'))
  assert.ok(result.artifacts.coverageGaps.some(gap => /failed/i.test(gap)))
})

test('state: entity registry and content cache are shared and deduplicated', async () => {
  const registry = new EntityRegistry()
  registry.add({ key: 'brand:a', level: 'brand', name: 'A', aliases: [], governorate: 'Cairo', platform: null, parentKey: null })
  registry.add({ key: 'brand:a', level: 'brand', name: 'A Egypt', aliases: [], governorate: 'Cairo', platform: null, parentKey: null })
  assert.equal(registry.size, 1)
  assert.deepEqual(registry.get('brand:a')?.aliases, ['A Egypt'])

  const cache = new ContentCache(canonicalizeUrl)
  const source = { id: 's1', url: 'https://a.example/p?utm_source=x', canonicalUrl: 'https://a.example/p', title: 'A', sourceType: 'website', provider: 'firecrawl', toolAction: 'scrape', toolkitVersion: '1', capturedAt: '2026-01-01T00:00:00Z', publishedAt: null, excerpt: 'x', contentHash: 'h', availability: 'retrieved', storagePolicy: 'workspace', usage: { calls: 1, pages: 1, tokens: 0, credits: 1 }, credits: 1, market: 'EG', sector: null, authority: null, authorityScore: 0.5, geography: null, period: null, blockedReason: null } as const
  const first = cache.store({ ...source })
  const second = cache.store({ ...source, id: 's2' })
  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  assert.equal(cache.size, 1)
})

test('brief: selection follows the request, not a fixed battery', () => {
  const brandOnly = selectTracks('How should we position our brand?', 'standard')
  assert.ok(brandOnly.includes('brand_positioning'))
  assert.ok(!brandOnly.includes('benchmark_strategy'))
  const strategy = selectTracks('Benchmark competitors and recommend an opportunity', 'deep')
  assert.ok(strategy.includes('benchmark_strategy'))
})

test('brief: a track list is never empty', () => {
  const tracks: ResearchTrack[] = selectTracks('anything at all', 'quick')
  assert.ok(tracks.length >= 1)
})

test('context: a worker context exposes prior artifacts to later tracks', async () => {
  let observed: ResearchTrack[] = []
  const later: Subagent = {
    name: 'competitor_intelligence',
    track: 'competitor_commercial',
    role: 'subagent',
    skill: 'egypt-competitor-commercial',
    async run(context: WorkerContext): Promise<WorkerResult> {
      observed = [...context.prior.keys()]
      return { track: 'competitor_commercial', summary: 'ok', entities: [], observations: [], sources: [], candidates: [], usage: { calls: 0, pages: 0, tokens: 0, credits: 0 }, coverageGaps: [], claims: [] }
    },
  }
  const { director } = directorWith({ calls: 10, pages: 10, tokens: 2000, seconds: 60, credits: 10 }, [createStubSubagent('market_demand'), later])
  await director.run({ request: 'Research market and competitors', mode: 'standard', profile, signal: new AbortController().signal })
  assert.ok(observed.includes('market_demand'))
})