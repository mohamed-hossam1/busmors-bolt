import { addUsage, emptyUsage, type EvidenceObservation, type SourceRecord, type UsageRecord } from '../contracts'
import type { CandidateUrl } from '../providers/normalize'
import type { QueryFamily } from '../providers/router'
import type { WorkerClaim, WorkerContext, WorkerResult } from '../director/director'
import type { ResearchTrack } from '../contracts'
import { evaluateClaim } from '../references/rubric'

export interface GatherOptions {
  family: QueryFamily
  queries: string[]
  sector: string | null
  geography: string | null
  maxOpen: number
  minResults?: number
  allowEscalation?: boolean
}

export interface Gathered {
  sources: SourceRecord[]
  candidates: CandidateUrl[]
  usage: UsageRecord
  queries: string[]
  notes: string[]
}

/**
 * Shared retrieval helper for every specialist. It reserves through the shared
 * ledger, records a visible tool_call per provider, and never opens the same page twice.
 */
export async function gather(context: WorkerContext, options: GatherOptions): Promise<Gathered> {
  const usage = emptyUsage()
  const sources = new Map<string, SourceRecord>()
  const candidates = new Map<string, CandidateUrl>()
  const notes: string[] = []
  const executed: string[] = []

  for (const query of options.queries) {
    if (Date.now() > context.deadlineAt) {
      notes.push('Stopped querying: the run time budget was exhausted.')
      break
    }
    if (context.ledger.exhausted) {
      notes.push(`Stopped querying: the free-tier allowance is exhausted. Remaining queries were dropped.`)
      break
    }
    let outcome
    try {
      outcome = await context.router.search(options.family, query, {
        signal: context.signal,
        sector: options.sector,
        geography: options.geography,
        minResults: options.minResults,
        allowEscalation: options.allowEscalation,
      })
    } catch (error) {
      notes.push(`Query "${query}" failed: ${error instanceof Error ? error.message : 'unknown error'}`)
      continue
    }
    executed.push(query)
    addUsage(usage, outcome.usage)
    for (const candidate of outcome.candidates) if (!candidates.has(candidate.url)) candidates.set(candidate.url, candidate)
    for (const source of outcome.sources) sources.set(source.id, source)
    for (const note of outcome.notes) if (!notes.includes(note)) notes.push(note)
    await context.emit({
      instanceId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      parentInstanceId: context.instanceId,
      type: 'tool_call',
      agentId: options.family === 'page' ? 'firecrawl' : options.family === 'semantic' ? 'exa' : 'tavily',
      agentRole: 'tool',
      label: `${options.family} search`,
      status: outcome.ok ? 'completed' : 'partial',
      publicMessage: `Searched "${query}" — ${outcome.candidates.length} candidate page(s)${outcome.escalated ? `, escalated to ${outcome.primary === 'tavily' ? 'Exa' : 'Tavily'} (${outcome.escalationReason})` : ''}.`,
      parametersRedacted: { query, family: options.family, escalated: outcome.escalated, candidates: outcome.candidates.length },
      sourceIds: outcome.sources.map(source => source.id),
      consumption: outcome.usage,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      failureReason: outcome.ok ? null : outcome.message ?? null,
    })
  }

  let opened = 0
  for (const candidate of candidates.values()) {
    if (opened >= options.maxOpen) break
    if (Date.now() > context.deadlineAt) {
      notes.push('Stopped opening pages: the run time budget was exhausted.')
      break
    }
    if (context.ledger.exhausted) {
      notes.push('Stopped opening pages: the free-tier allowance is exhausted.')
      break
    }
    if (context.cache.has(candidate.url)) {
      const cached = context.cache.get(candidate.url)
      if (cached) sources.set(cached.id, cached)
      continue
    }
    try {
      const openedPage = await context.router.open(candidate.url, { signal: context.signal, sector: options.sector, geography: options.geography })
      addUsage(usage, openedPage.usage)
      opened += 1
      for (const source of openedPage.outcome.sources) {
        sources.set(source.id, source.discoveredBy ? source : { ...source, discoveredBy: candidate.provider })
      }
      for (const note of openedPage.outcome.notes) if (!notes.includes(note)) notes.push(note)
      const source = openedPage.outcome.sources[0]
      await context.emit({
        instanceId: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        parentInstanceId: context.instanceId,
        type: 'tool_call',
        agentId: 'firecrawl',
        agentRole: 'tool',
        label: 'Open a candidate page',
        status: source && source.availability === 'retrieved' ? 'completed' : 'partial',
        publicMessage: `Opened ${candidate.url}${source && source.availability !== 'retrieved' ? ' — page unavailable, recorded as blocked' : ''}.`,
        parametersRedacted: { url: candidate.url, availability: source?.availability ?? 'unknown' },
        sourceIds: source ? [source.id] : [],
        consumption: openedPage.usage,
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        failureReason: source && source.availability !== 'retrieved' ? source.blockedReason : null,
      })
    } catch (error) {
      notes.push(`Opening ${candidate.url} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return { sources: [...sources.values()], candidates: [...candidates.values()], usage, queries: executed, notes }
}

/** Only material retrieval problems become coverage gaps; informational notes stay on the tool event. */
export function coverageNotes(notes: string[]): string[] {
  return notes.filter(note => /(?:stopped|failed|exhausted|blocked|unavailable|no evidence|refused|no readable)/i.test(note))
}

export function observation(source: SourceRecord, quote: string, kind: EvidenceObservation['kind'] = 'observation'): EvidenceObservation {
  return {
    id: `obs:${source.id}:${kind}:${quote.slice(0, 24)}`,
    kind,
    sourceId: source.id,
    sourceUrl: source.url,
    quote,
    quoteLanguage: /[\u0600-\u06FF]/.test(quote) ? 'ar-EG' : 'en',
    translation: null,
    observedAt: source.capturedAt,
    geography: source.geography,
    period: source.period,
    directness: 'direct',
    storagePolicy: source.storagePolicy,
  }
}

/** A claim always carries its quality score, coverage and reasons. */
export function makeClaim(input: {
  id: string
  statement: string
  statementAr?: string | null
  kind?: string
  evidence: EvidenceObservation[]
  sources: SourceRecord[]
  geography: string | null
  scopeRelevance?: number
  today?: Date
  conflicts?: string[]
}): WorkerClaim {
  const quality = evaluateClaim({ statement: input.statement, geography: input.geography }, input.evidence, input.sources, { today: input.today, scopeRelevance: input.scopeRelevance })
  return {
    id: input.id,
    statement: input.statement,
    statementAr: input.statementAr ?? null,
    kind: input.kind ?? 'observation',
    confidence: quality.score >= 0.82 ? 'strong' : quality.score >= 0.68 ? 'validated' : quality.score >= 0.5 ? 'supported' : 'hypothesis',
    evidenceIds: input.evidence.map(item => item.id),
    sourceIds: [...new Set(input.evidence.map(item => item.sourceId))],
    geography: input.geography,
    validFrom: null,
    validUntil: null,
    claimQuality: { score: quality.score, coverage: quality.coverage, reasons: quality.reasons },
    conflicts: input.conflicts ?? [],
  }
}

export interface StopState {
  round: number
  newEntities: number
  previousTotal: number
}

/** Stop when two rounds add <5% new entities, the target is met, or the budget is spent. */
export function shouldStop(state: StopState, rules: { maxQueryRounds: number; minNewEntityPercent: number; entityTarget: number }, total: number): { stop: boolean; reason: string | null } {
  if (state.round >= rules.maxQueryRounds) return { stop: true, reason: `Reached the ${rules.maxQueryRounds} query round ceiling.` }
  if (total >= rules.entityTarget) return { stop: true, reason: `Entity target of ${rules.entityTarget} reached.` }
  if (state.round >= 2) {
    const growth = state.previousTotal === 0 ? 1 : state.newEntities / state.previousTotal
    if (growth < rules.minNewEntityPercent) return { stop: true, reason: `Diminishing returns: only ${(growth * 100).toFixed(1)}% new entities in the last round.` }
  }
  return { stop: false, reason: null }
}

export function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  const output: T[] = []
  for (const item of items) {
    const value = key(item)
    if (seen.has(value)) continue
    seen.add(value)
    output.push(item)
  }
  return output
}

export function result(input: {
  track: ResearchTrack
  summary: string
  sources: SourceRecord[]
  observations: EvidenceObservation[]
  entities?: WorkerResult['entities']
  usage: UsageRecord
  coverageGaps?: string[]
  claims?: WorkerClaim[]
}): WorkerResult {
  return {
    track: input.track,
    summary: input.summary,
    sources: uniqueBy(input.sources, source => source.url),
    observations: uniqueBy(input.observations, item => item.id),
    entities: uniqueBy(input.entities ?? [], entity => entity.key),
    candidates: [],
    usage: input.usage,
    coverageGaps: input.coverageGaps ?? [],
    claims: input.claims ?? [],
  }
}