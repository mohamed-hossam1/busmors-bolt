import type { ProviderName, SourceRecord, UsageRecord } from '../contracts'
import { emptyUsage } from '../contracts'
import type { FreeTierLedger } from '../ledger/ledger'
import { InsufficientAllowanceError } from '../ledger/ledger'
import { normalizeQuery, type CandidateUrl } from './normalize'
import type { ProviderAdapter, ProviderContext, ProviderOutcome, ProviderErrorCode } from './types'

export type QueryFamily = 'keyword' | 'semantic' | 'social' | 'official' | 'local' | 'page'

export const QUERY_FAMILIES: readonly QueryFamily[] = Object.freeze(['keyword', 'semantic', 'social', 'official', 'local', 'page'])

export interface RouterProviders {
  firecrawl: ProviderAdapter<{ url: string; sector?: string | null; geography?: string | null }>
  tavily: ProviderAdapter<{ query: string; maxResults?: number; sector?: string | null; geography?: string | null }>
  exa: ProviderAdapter<{ query: string; maxResults?: number; sector?: string | null; geography?: string | null }>
  osm: ProviderAdapter<{ query: string; lat?: number; lon?: number; sector?: string | null }>
  egypt_official: ProviderAdapter<{ url: string; issuer: string; sector?: string | null; period?: string | null; geography?: string | null; authorityScore?: number }>
  composio: ProviderAdapter<{ platform: string; action: string; mode: 'instant' | 'connected'; query: string; params?: Record<string, unknown> }>
}

export interface ExecutedProvider {
  provider: ProviderName
  outcome: ProviderOutcome
  usage: UsageRecord
}

/** Reserve → execute → settle for exactly one provider call. */
export async function executeProvider(
  ledger: FreeTierLedger,
  provider: ProviderAdapter<unknown>,
  input: unknown,
  context: { taskId: string; signal: AbortSignal },
): Promise<ExecutedProvider> {
  const estimate = provider.estimate(input)
  const reservation = await ledger.reserve(provider.name, describeOperation(provider.name), estimate)
  const callContext: ProviderContext = { taskId: context.taskId, callId: reservation.callId, signal: context.signal }
  try {
    const outcome = await provider.execute(input, callContext)
    await ledger.settle(reservation.callId, outcome.usage)
    return { provider: provider.name, outcome, usage: outcome.usage }
  } catch (error) {
    try { await ledger.release(reservation.callId) } catch { /* The reservation expires with the run. */ }
    throw error
  }
}

function describeOperation(provider: ProviderName): string {
  switch (provider) {
    case 'firecrawl': return 'extract_page'
    case 'tavily': return 'basic_search'
    case 'exa': return 'semantic_search'
    case 'egypt_official': return 'official_source'
    case 'osm': return 'overpass_nearby'
    case 'composio': return 'social_read'
  }
}

export interface SearchOutcome {
  ok: boolean
  code?: ProviderErrorCode
  message?: string
  family: QueryFamily
  query: string
  primary: ProviderName
  escalated: boolean
  escalationReason: string | null
  candidates: CandidateUrl[]
  sources: SourceRecord[]
  usage: UsageRecord
  cached: boolean
  notes: string[]
}

const PRIMARY: Readonly<Record<QueryFamily, ProviderName>> = Object.freeze({
  keyword: 'tavily',
  semantic: 'exa',
  social: 'composio',
  official: 'egypt_official',
  local: 'osm',
  page: 'firecrawl',
})

/** A second provider only runs for weak results or an explicit verification. */
const ESCALATION: Readonly<Partial<Record<QueryFamily, ProviderName>>> = Object.freeze({ keyword: 'exa', semantic: 'tavily' })

/**
 * Ticket 04: the router owns query families and refuses to repeat an identical
 * query across providers. It escalates only with a recorded justification.
 */
export class ProviderRouter {
  private readonly seen = new Set<string>()
  private readonly cache = new Map<string, SearchOutcome>()

  constructor(private readonly ledger: FreeTierLedger, private readonly providers: RouterProviders, private readonly taskId: string) {}

  /** Run the primary provider for a family, escalating only when justified. */
  async search(family: QueryFamily, query: string, options: {
    signal: AbortSignal
    sector?: string | null
    geography?: string | null
    maxResults?: number
    minResults?: number
    allowEscalation?: boolean
    verification?: boolean
  } = { signal: new AbortController().signal }): Promise<SearchOutcome> {
    const key = `${family}:${normalizeQuery(query)}`
    const cached = this.cache.get(key)
    if (cached) return { ...cached, cached: true }

    const primary = PRIMARY[family]
    const executed = await this.run(primary, query, options)
    const candidates = executed.outcome.candidates
    const sources = executed.outcome.sources
    const usage = executed.usage
    const notes = [...executed.outcome.notes]
    const minResults = options.minResults ?? 3
    let escalated = false
    let escalationReason: string | null = null

    const weak = family !== 'official' && family !== 'local' && family !== 'social' && candidates.length < minResults
    const secondary = ESCALATION[family]
    if (secondary && (weak || options.verification) && options.allowEscalation !== false && !this.ledger.exhausted) {
      const verification = await this.run(secondary, query, options)
      escalated = true
      escalationReason = options.verification
        ? 'Explicit verification: a second provider independently confirms the same query.'
        : `Primary provider returned ${candidates.length} candidate(s), below the ${minResults} threshold.`
      for (const candidate of verification.outcome.candidates) if (!candidates.some(item => item.url === candidate.url)) candidates.push(candidate)
      for (const source of verification.outcome.sources) sources.push(source)
      addUsage(usage, verification.usage)
      notes.push(...verification.outcome.notes.map(note => `${secondary}: ${note}`))
    }

    const outcome: SearchOutcome = {
      ok: executed.outcome.ok || candidates.length > 0 || sources.length > 0,
      ...(executed.outcome.ok ? {} : { code: executed.outcome.code, message: executed.outcome.message }),
      family,
      query,
      primary,
      escalated,
      escalationReason,
      candidates,
      sources,
      usage,
      cached: false,
      notes,
    }
    this.seen.add(key)
    this.cache.set(key, outcome)
    return outcome
  }

  /** Ticket 06/11: the bounded public social sample, straight through the allowlist. */
  async social(input: {
    platform: 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'reddit'
    action: string
    mode: 'instant' | 'connected'
    query: string
    params?: Record<string, unknown>
    signal: AbortSignal
  }): Promise<ExecutedProvider> {
    const adapter = this.providers.composio as ProviderAdapter<unknown>
    return executeProvider(this.ledger, adapter, {
      platform: input.platform,
      action: input.action,
      mode: input.mode,
      query: input.query,
      params: input.params ?? {},
    }, { taskId: this.taskId, signal: input.signal })
  }

  /** True when this identical query was already executed in this run. */
  has(family: QueryFamily, query: string): boolean {
    return this.seen.has(`${family}:${normalizeQuery(query)}`)
  }

  /** Open a specific URL. This is the only path that turns a candidate into a source. */
  async open(url: string, options: { signal: AbortSignal; sector?: string | null; geography?: string | null }): Promise<ExecutedProvider> {
    const key = `page:${normalizeQuery(url)}`
    if (this.seen.has(key)) {
      const cached = this.cache.get(key)
      if (cached) {
        const source = cached.sources[0]
        return { provider: 'firecrawl', outcome: { ok: true, sources: source ? [source] : [], candidates: [], usage: emptyUsage(), notes: ['Reused the already-opened page from the shared content cache.'] }, usage: emptyUsage() }
      }
    }
    const executed = await this.run('firecrawl', url, { ...options, maxResults: 1 })
    this.seen.add(key)
    this.cache.set(key, { ok: executed.outcome.ok, family: 'page', query: url, primary: 'firecrawl', escalated: false, escalationReason: null, candidates: executed.outcome.candidates, sources: executed.outcome.sources, usage: executed.usage, cached: false, notes: executed.outcome.notes })
    return executed
  }

  private async run(provider: ProviderName, query: string, options: {
    signal: AbortSignal
    sector?: string | null
    geography?: string | null
    maxResults?: number
    verification?: boolean
  }): Promise<ExecutedProvider> {
    if (provider === 'composio') throw new Error('Composio runs through router.social(), never through the search families.')
    const adapter = this.providers[provider] as ProviderAdapter<unknown>
    const input = provider === 'firecrawl'
      ? { url: query, sector: options.sector ?? null, geography: options.geography ?? null }
      : provider === 'egypt_official'
        ? { url: query, issuer: 'Egypt official source', sector: options.sector ?? null, geography: options.geography ?? 'Egypt' }
        : provider === 'osm'
          ? { query, sector: options.sector ?? null }
          : { query, maxResults: options.maxResults ?? 8, sector: options.sector ?? null, geography: options.geography ?? null }
    return executeProvider(this.ledger, adapter, input, { taskId: this.taskId, signal: options.signal })
  }
}

/** Router errors stay typed: an exhausted allowance is never retried. */
export async function searchOrReduce<T>(operation: () => Promise<T>, reduce: (error: InsufficientAllowanceError) => T): Promise<{ result: T; reduced: boolean }> {
  try {
    return { result: await operation(), reduced: false }
  } catch (error) {
    if (error instanceof InsufficientAllowanceError) return { result: reduce(error), reduced: true }
    throw error
  }
}

export function addUsage(target: UsageRecord, addition: Partial<UsageRecord>): UsageRecord {
  target.calls += addition.calls ?? 0
  target.pages += addition.pages ?? 0
  target.tokens += addition.tokens ?? 0
  target.credits += addition.credits ?? 0
  return target
}
