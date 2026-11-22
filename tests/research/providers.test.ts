import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FreeTierLedger, memoryLedgerBackend } from '../../src/features/research/ledger/ledger'
import { ProviderRouter, executeProvider } from '../../src/features/research/providers/router'
import { createTavilyProvider, createExaProvider } from '../../src/features/research/providers/search'
import { createFirecrawlProvider } from '../../src/features/research/providers/firecrawl'
import { createEgyptOfficialProvider } from '../../src/features/research/providers/egypt-official'
import { createOsmProvider } from '../../src/features/research/providers/osm'
import { createComposioProvider } from '../../src/features/research/providers/composio'
import { fakeComposio, fakeMap, fakeOfficial, fakeScrape, fakeSearch } from './support/fakes'
import type { ResearchBudget } from '../../src/features/research/contracts'
import { PolicyViolation } from '../../src/features/research/policy'

const budget: ResearchBudget = { calls: 20, pages: 20, tokens: 5000, seconds: 60, credits: 20 }
const signal = new AbortController().signal

function makeRouter() {
  const memory = memoryLedgerBackend(budget)
  const ledger = new FreeTierLedger(memory.backend, budget, 'task-1')
  const router = new ProviderRouter(ledger, {
    firecrawl: createFirecrawlProvider(fakeScrape({ 'https://a.example/p': { title: 'A', markdown: 'Ceramic repair in Cairo costs EGP 500 and takes two days.' } }, { blocked: ['https://blocked.example/x'] })),
    tavily: createTavilyProvider(fakeSearch([{ url: 'https://a.example/p', title: 'A', snippet: 'ceramic repair' }, { url: 'https://b.example/q', title: 'B', snippet: 'ceramic' }])),
    exa: createExaProvider(fakeSearch([{ url: 'https://c.example/r', title: 'C', snippet: 'kintsugi egypt' }])),
    osm: createOsmProvider(fakeMap([{ name: 'Cairo Ceramic Studio', lat: 30.05, lon: 31.23, kind: 'shop', address: 'Maadi' }])),
    egypt_official: createEgyptOfficialProvider(fakeOfficial({ 'https://capmas.gov.eg/x': { title: 'CAPMAS report', markdown: 'Official statistics for 2026 Q2 covering Egyptian retail.', issuer: 'CAPMAS' } })),
    composio: createComposioProvider(fakeComposio()),
  }, 'task-1')
  return { router, ledger }
}

test('firecrawl: a blocked URL is stored as blocked, never as content', async () => {
  const provider = createFirecrawlProvider(fakeScrape({}, { blocked: ['https://blocked.example/x'] }))
  const outcome = await provider.execute({ url: 'https://blocked.example/x' }, { taskId: 't', callId: 'c1', signal })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.sources.length, 1)
  assert.equal(outcome.sources[0].availability, 'blocked')
  assert.equal(outcome.sources[0].excerpt, '')
  assert.match(outcome.sources[0].blockedReason ?? '', /403/)
  assert.equal(outcome.usage.pages, 1)
})

test('firecrawl: a retrieved page records excerpt, hash and usage', async () => {
  const provider = createFirecrawlProvider(fakeScrape({ 'https://a.example/p': { title: 'A', markdown: 'Ceramic repair in Cairo costs EGP 500.' } }))
  const outcome = await provider.execute({ url: 'https://a.example/p' }, { taskId: 't', callId: 'c2', signal })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.sources[0].availability, 'retrieved')
  assert.match(outcome.sources[0].excerpt, /EGP 500/)
  assert.equal(outcome.sources[0].contentHash.length, 16)
  assert.equal(outcome.sources[0].credits, 1)
})

test('search: Tavily candidates are discovery only and Exa escalates', async () => {
  const { router, ledger } = makeRouter()
  const outcome = await router.search('keyword', 'ceramic repair', { signal, sector: 'construction', minResults: 1 })
  assert.equal(outcome.primary, 'tavily')
  assert.equal(outcome.candidates.length, 2)
  assert.equal(outcome.escalated, false)
  assert.equal(outcome.sources.length, 0)
  assert.ok(ledger.snapshot.allowance.calls < budget.calls)

  const weak = await router.search('semantic', 'ceramic repair', { signal, minResults: 99 })
  assert.equal(weak.escalated, true)
  assert.equal(weak.primary, 'exa')
  assert.match(weak.escalationReason ?? '', /below the 99 threshold/)
})

test('router: an identical query is never repeated across providers', async () => {
  const { router } = makeRouter()
  await router.search('keyword', 'ceramic repair', { signal })
  const again = await router.search('keyword', 'Ceramic   Repair', { signal })
  assert.equal(again.cached, true)
  assert.equal(router.has('keyword', 'ceramic repair'), true)
  assert.equal(router.has('semantic', 'ceramic repair'), false)
})

test('router: opening a page promotes a candidate into a source', async () => {
  const { router } = makeRouter()
  const opened = await router.open('https://a.example/p', { signal })
  assert.equal(opened.provider, 'firecrawl')
  assert.equal(opened.outcome.sources[0].availability, 'retrieved')
  const cached = await router.open('https://a.example/p', { signal })
  assert.equal(cached.usage.calls, 0)
})

test('official + osm: Egypt sources carry period, geography and authority', async () => {
  const { router } = makeRouter()
  const official = await router.search('official', 'https://capmas.gov.eg/x', { signal })
  assert.equal(official.primary, 'egypt_official')
  assert.equal(official.sources[0].authority, 'CAPMAS')
  assert.equal(official.sources[0].period, '2026 Q2')
  assert.equal(official.sources[0].authorityScore, 0.95)
  const maps = await router.search('local', 'ceramic repair', { signal })
  assert.equal(maps.sources[0].provider, 'osm')
  assert.match(maps.sources[0].excerpt, /Cairo Ceramic Studio/)
})

test('composio: allowlisted read runs, PII actions throw, payment is refused', async () => {
  const provider = createComposioProvider(fakeComposio({ data: { data: [{ id: '1', url: 'https://facebook.com/p/1', text: 'الأسعار غالية', author: 'owner' }] }, chargedCredits: 2, price: { ok: true, credits: 2, paymentRequired: false } }))
  const outcome = await provider.execute({ platform: 'facebook', action: 'posts_list', mode: 'instant', query: 'ceramic' }, { taskId: 't', callId: 'c3', signal })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.sources[0].toolAction, 'facebook/posts_list')
  assert.equal(outcome.sources[0].storagePolicy, 'excerpt')
  assert.equal(outcome.usage.credits, 2)

  await assert.rejects(
    () => provider.execute({ platform: 'facebook', action: 'creator_email', mode: 'instant', query: 'x' }, { taskId: 't', callId: 'c4', signal }),
    PolicyViolation,
  )

  const paid = createComposioProvider(fakeComposio({ paymentRequired: true, price: { ok: true, credits: 2, paymentRequired: true } }))
  const refused = await paid.execute({ platform: 'youtube', action: 'transcripts_get', mode: 'instant', query: 'x' }, { taskId: 't', callId: 'c5', signal })
  assert.equal(refused.ok, false)
  if (!refused.ok) {
    assert.equal(refused.code, 'payment_required')
    assert.equal(refused.usage.credits, 0)
  }
})

test('executeProvider: an exhausted ledger never calls the provider', async () => {
  const memory = memoryLedgerBackend({ calls: 0, pages: 0, tokens: 0, seconds: 10, credits: 0 })
  const ledger = new FreeTierLedger(memory.backend, { calls: 0, pages: 0, tokens: 0, seconds: 10, credits: 0 }, 't')
  const provider = createTavilyProvider(fakeSearch([]))
  await assert.rejects(
    () => executeProvider(ledger, provider, { query: 'x' }, { taskId: 't', signal }),
    (error: unknown) => error instanceof Error && error.name === 'InsufficientAllowanceError',
  )
  assert.equal(memory.allowance.calls, 0)
})