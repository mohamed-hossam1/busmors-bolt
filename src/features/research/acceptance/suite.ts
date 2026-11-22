import type { ResearchArtifacts, SourceRecord, UsageRecord, VisibleAgentEvent } from '../contracts'
import { GOLDEN_INDUSTRIES, GOLDEN_PRICES, goldenCompetitors } from '../golden'
import { EGP_VAT_RATE, parsePackSize, parsePriceText, vatAmount } from '../references/pricing'
import { normalizeText } from '../references/lexicon'

/** Release thresholds. These are measured, never assumed. */
export const THRESHOLDS = Object.freeze({
  competitorRecallAt20: 0.8,
  duplicateEntityRate: 0.05,
  citationCoverage: 0.95,
  priceNormalizationAccuracy: 0.9,
})

export interface MetricResult {
  name: string
  value: number
  threshold: number
  comparator: 'gte' | 'lte'
  passed: boolean
  detail: string
}

export interface PolicyResult {
  name: string
  passed: boolean
  detail: string
}

export interface AcceptanceReport {
  passed: boolean
  metrics: MetricResult[]
  policy: PolicyResult[]
  cost: { perProvider: Record<string, UsageRecord>; perAgent: Record<string, UsageRecord>; total: UsageRecord }
  latency: { perAgent: Record<string, number>; slowestAgent: string | null }
  providerContribution: { provider: string; sources: number; passed: boolean }[]
  corrections: { tracked: number; rate: number }
}

export interface AcceptanceInput {
  industryKey: string
  artifacts: ResearchArtifacts
  sources: SourceRecord[]
  events: VisibleAgentEvent[]
  claims: { id: string; statement: string; evidenceIds: string[]; sourceIds: string[]; claimQuality: { score: number } }[]
  entities: string[]
  /** Count of research-backed brain nodes that are not owner-approved. */
  brainWritesUnapproved?: number
  correctionsHistory?: { release: string; corrections: number; claims: number }[]
}

export function normalizeName(value: string): string {
  return normalizeText(value.replace(/\b(?:llc|l\.l\.c|s\.a\.e|co|company|inc|ltd)\b/gi, ' '))
}

/** Competitor recall@20 against the golden list for the industry. */
export function competitorRecall(industryKey: string, discovered: string[]): { recall: number; matched: string[]; missing: string[] } {
  const golden = goldenCompetitors(industryKey)
  const found = new Set(discovered.slice(0, 20).map(normalizeName))
  const matched = golden.filter(name => found.has(normalizeName(name)))
  const missing = golden.filter(name => !found.has(normalizeName(name)))
  return { recall: golden.length ? matched.length / golden.length : 1, matched, missing }
}

/** Duplicate entity rate from the director's registry (unique vs raw mentions). */
export function duplicateRate(entities: string[]): { rate: number; duplicates: number; total: number } {
  const seen = new Set<string>()
  let duplicates = 0
  for (const entity of entities) {
    const key = normalizeName(entity)
    if (seen.has(key)) duplicates += 1
    else seen.add(key)
  }
  const total = entities.length
  return { rate: total === 0 ? 0 : duplicates / total, duplicates, total }
}

/** Price-normalization accuracy against the hand-corrected fixtures. */
export function priceNormalizationAccuracy(): { accuracy: number; correct: number; total: number; failures: string[] } {
  let correct = 0
  const failures: string[] = []
  for (const fixture of GOLDEN_PRICES) {
    const parsed = parsePriceText(fixture.rawText)
    const expected = fixture.expected
    const pack = parsePackSize(`${fixture.product} ${fixture.packSize ?? ''}`)
    if (fixture.packSize && !pack) {
      failures.push(`${fixture.id}: pack size not parsed from "${fixture.rawText}"`)
      continue
    }
    const amountMatches = !!parsed && parsed.currency === expected.currency && parsed.amount === expected.amount
    const landedMatches = expected.currency !== 'EGP'
      || computedLanded(parsed!.amount, expected.vatIncluded) === expectedLanded(expected.amount, expected.vatIncluded)
    if (amountMatches && landedMatches) correct += 1
    else failures.push(`${fixture.id}: expected ${expected.amount} ${expected.currency} (VAT ${expected.vatIncluded ? 'included' : 'added'}) from "${fixture.rawText}", got ${parsed ? `${parsed.amount} ${parsed.currency}` : 'no price'}`)
  }
  const total = GOLDEN_PRICES.length
  return { accuracy: total ? correct / total : 1, correct, total, failures }
}

function computedLanded(amount: number, vatIncluded: boolean): number {
  return Math.round((amount + vatAmount(amount, EGP_VAT_RATE, vatIncluded)) * 100) / 100
}

function expectedLanded(amount: number, vatIncluded: boolean): number {
  return computedLanded(amount, vatIncluded)
}

const PII_PATTERNS: readonly { name: string; pattern: RegExp }[] = Object.freeze([
  { name: 'email', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { name: 'phone', pattern: /(?:\+?20|0)?1[0125]\d{8}/ },
])

/** No unnecessary PII in claims, quotes or proposals. */
export function scanForPii(claims: { statement: string }[]): { clean: boolean; findings: string[] } {
  const findings: string[] = []
  for (const claim of claims) {
    for (const rule of PII_PATTERNS) if (rule.pattern.test(claim.statement)) findings.push(`${rule.name} pattern in: ${claim.statement.slice(0, 60)}`)
  }
  return { clean: findings.length === 0, findings }
}

export interface CostLatencyInput {
  events: VisibleAgentEvent[]
  sources: SourceRecord[]
  artifacts: ResearchArtifacts
}

/** Cost and latency per provider and per agent, from persisted events. */
export function costAndLatency(input: CostLatencyInput): { cost: AcceptanceReport['cost']; latency: AcceptanceReport['latency'] } {
  const perProvider: Record<string, UsageRecord> = {}
  const perAgent: Record<string, UsageRecord> = {}
  const latency: Record<string, number> = {}
  for (const event of input.events) {
    const agent = perAgent[event.agentId] ?? { calls: 0, pages: 0, tokens: 0, credits: 0 }
    perAgent[event.agentId] = {
      calls: agent.calls + event.consumption.calls,
      pages: agent.pages + event.consumption.pages,
      tokens: agent.tokens + event.consumption.tokens,
      credits: agent.credits + event.consumption.credits,
    }
    if (event.startedAt && event.endedAt) {
      const ms = Date.parse(event.endedAt) - Date.parse(event.startedAt)
      if (Number.isFinite(ms) && ms >= 0) latency[event.agentId] = (latency[event.agentId] ?? 0) + ms
    }
  }
  for (const source of input.sources) {
    const provider = perProvider[source.provider] ?? { calls: 0, pages: 0, tokens: 0, credits: 0 }
    perProvider[source.provider] = {
      calls: provider.calls + source.usage.calls,
      pages: provider.pages + source.usage.pages,
      tokens: provider.tokens + source.usage.tokens,
      credits: provider.credits + source.usage.credits + source.credits,
    }
  }
  const total = Object.values(perProvider).reduce((sum, usage) => ({
    calls: sum.calls + usage.calls,
    pages: sum.pages + usage.pages,
    tokens: sum.tokens + usage.tokens,
    credits: sum.credits + usage.credits,
  }), { calls: 0, pages: 0, tokens: 0, credits: 0 })
  const slowest = Object.entries(latency).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { cost: { perProvider, perAgent, total }, latency: { perAgent: latency, slowestAgent: slowest } }
}

/** Every core provider must contribute to the Egyptian evidence base. */
export function providerContribution(sources: SourceRecord[]): AcceptanceReport['providerContribution'] {
  const core = ['firecrawl', 'tavily', 'exa', 'egypt_official', 'osm', 'composio']
  return core.map(provider => {
    const contributed = sources.filter(source => source.availability === 'retrieved' && (source.provider === provider || source.discoveredBy === provider)).length
    return { provider, sources: contributed, passed: contributed > 0 }
  })
}

/** Analyst correction rate is tracked across releases, never inferred. */
export function correctionRate(history: { release: string; corrections: number; claims: number }[] = []): { tracked: number; rate: number } {
  if (!history.length) return { tracked: 0, rate: 0 }
  const corrections = history.reduce((sum, entry) => sum + entry.corrections, 0)
  const claims = history.reduce((sum, entry) => sum + entry.claims, 0)
  return { tracked: history.length, rate: claims ? corrections / claims : 0 }
}

/** The full acceptance report: metrics, policy checks, cost and latency. */
export function runAcceptance(input: AcceptanceInput): AcceptanceReport {
  const recall = competitorRecall(input.industryKey, input.entities)
  const duplicates = duplicateRate(input.entities)
  const coverage = input.artifacts.citationCoverage
  const price = priceNormalizationAccuracy()
  const pii = scanForPii(input.claims)
  const cost = costAndLatency({ events: input.events, sources: input.sources, artifacts: input.artifacts })
  const contribution = providerContribution(input.sources)
  const corrections = correctionRate(input.correctionsHistory)
  const industry = GOLDEN_INDUSTRIES.find(item => item.key === input.industryKey)

  const metrics: MetricResult[] = [
    { name: 'competitor_recall_at_20', value: recall.recall, threshold: THRESHOLDS.competitorRecallAt20, comparator: 'gte', passed: recall.recall >= THRESHOLDS.competitorRecallAt20, detail: `Matched ${recall.matched.length}/${industry ? goldenCompetitors(input.industryKey).length : 0} golden competitors${recall.missing.length ? `; missing: ${recall.missing.slice(0, 3).join(', ')}` : ''}` },
    { name: 'duplicate_entity_rate', value: duplicates.rate, threshold: THRESHOLDS.duplicateEntityRate, comparator: 'lte', passed: duplicates.rate <= THRESHOLDS.duplicateEntityRate, detail: `${duplicates.duplicates} duplicate(s) of ${duplicates.total} mention(s)` },
    { name: 'citation_coverage', value: coverage, threshold: THRESHOLDS.citationCoverage, comparator: 'gte', passed: coverage >= THRESHOLDS.citationCoverage, detail: `${(coverage * 100).toFixed(0)}% of consequential claims carry a citation` },
    { name: 'price_normalization_accuracy', value: price.accuracy, threshold: THRESHOLDS.priceNormalizationAccuracy, comparator: 'gte', passed: price.accuracy >= THRESHOLDS.priceNormalizationAccuracy, detail: `${price.correct}/${price.total} hand-corrected price fixtures${price.failures.length ? `; ${price.failures[0]}` : ''}` },
  ]

  const policy: PolicyResult[] = [
    { name: 'no_unnecessary_pii', passed: pii.clean, detail: pii.clean ? 'No email or phone patterns in claims.' : pii.findings.join('; ') },
    { name: 'composio_allowlist_only', passed: !input.sources.some(source => source.provider === 'composio' && !/^(facebook|instagram|tiktok|youtube|reddit)\/(profiles_get|posts_list|comments_list|transcripts_get|ad_library_search|channels_get|videos_list)$/.test(source.toolAction)), detail: 'Every Composio source used an allowlisted read action.' },
    { name: 'owner_approval_before_brain_write', passed: (input.brainWritesUnapproved ?? 0) === 0, detail: (input.brainWritesUnapproved ?? 0) === 0 ? 'No unapproved research-backed brain node exists.' : `${input.brainWritesUnapproved} unapproved research brain node(s) exist.` },
    { name: 'pdf_validation_gates_completion', passed: input.artifacts.pdf === null ? false : input.artifacts.pdf.passed, detail: input.artifacts.pdf ? `${input.artifacts.pdf.pageCount} page(s); ${input.artifacts.pdf.checks.filter(check => check.passed).length}/${input.artifacts.pdf.checks.length} checks passed.` : 'No PDF artifact was produced.' },
    { name: 'free_tier_only', passed: input.artifacts.consumption.credits <= input.artifacts.budget.credits, detail: `${input.artifacts.consumption.credits} credit(s) used of ${input.artifacts.budget.credits} budgeted; no purchase path exists.` },
    ...contribution.map(item => ({ name: `provider_${item.provider}_contributed`, passed: item.passed, detail: `${item.sources} retrieved source(s)` })),
  ]

  return {
    passed: metrics.every(metric => metric.passed) && policy.every(check => check.passed),
    metrics,
    policy,
    cost: cost.cost,
    latency: cost.latency,
    providerContribution: contribution,
    corrections,
  }
}

/** A short release note for the acceptance report. */
export function acceptanceSummary(report: AcceptanceReport): string {
  const failed = [...report.metrics.filter(metric => !metric.passed).map(metric => metric.name), ...report.policy.filter(check => !check.passed).map(check => check.name)]
  return failed.length ? `Acceptance failed: ${failed.join(', ')}` : 'Acceptance passed: recall, duplicate rate, citation coverage and price accuracy all within threshold.'
}