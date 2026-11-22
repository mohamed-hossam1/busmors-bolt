import type { ResearchBrief } from '../contracts'
import type { Subagent, WorkerContext, WorkerResult } from '../director/director'
import { agentForTrack } from '../director/brief'
import { gather, makeClaim, result, uniqueBy } from './common'
import type { WorkerClaim } from '../director/director'

export interface BenchmarkCriterion {
  id: string
  label: string
  weight: number
}

export interface BenchmarkRow {
  competitor: string
  scores: Record<string, number>
  weighted: number
  evidence: string[]
  coverage: number
}

export interface GapScore {
  opportunity: string
  painPrevalence: number
  severity: number
  unmetness: number
  businessFit: number
  evidenceConfidence: number
  score: number
  components: string
  coverage: string
}

export interface Recommendation {
  id: string
  evidence: string[]
  observedGap: string
  hypothesis: string
  expectedOutcome: string
  effort: 'low' | 'medium' | 'high'
  risk: 'low' | 'medium' | 'high'
  experiment: {
    weeks: number
    design: string
    successSignal: string
    failureSignal: string
  }
}

/** Transparent weights: every score shows what produced it. */
export const BENCHMARK_CRITERIA: readonly BenchmarkCriterion[] = Object.freeze([
  { id: 'price', label: 'Landed price competitiveness', weight: 0.3 },
  { id: 'proof', label: 'Evidence and proof points', weight: 0.25 },
  { id: 'trust', label: 'Trust signals', weight: 0.2 },
  { id: 'coverage', label: 'Geographic and channel coverage', weight: 0.15 },
  { id: 'clarity', label: 'Message clarity', weight: 0.1 },
])

const clamp01 = (value: number) => Math.max(0, Math.min(1, Math.round(value * 100) / 100))

function criterionScore(competitor: string, criterion: string, observations: WorkerResult['observations'], brief: ResearchBrief): { score: number; evidence: string[] } {
  const related = observations.filter(item => item.quote.toLowerCase().includes(competitor.split(' ')[0].toLowerCase()) || item.geography === brief.geography.governorates[0])
  const evidence = related.map(item => item.quote.slice(0, 120)).slice(0, 3)
  if (!related.length) return { score: 0.2, evidence: [] }
  switch (criterion) {
    case 'price': return { score: related.some(item => item.kind === 'price') ? 0.7 : 0.3, evidence }
    case 'proof': return { score: clamp01(related.length / 6), evidence }
    case 'trust': return { score: related.some(item => /(?:guarantee|warranty|ضمان|review|تقييم)/i.test(item.quote)) ? 0.75 : 0.35, evidence }
    case 'coverage': return { score: related.some(item => item.geography) ? 0.65 : 0.3, evidence }
    default: return { score: related.some(item => item.quote.length > 60) ? 0.6 : 0.4, evidence }
  }
}

export function buildBenchmark(competitors: string[], observations: WorkerResult['observations'], brief: ResearchBrief): BenchmarkRow[] {
  return competitors.map(competitor => {
    const scores: Record<string, number> = {}
    const evidence = new Set<string>()
    for (const criterion of BENCHMARK_CRITERIA) {
      const result_ = criterionScore(competitor, criterion.id, observations, brief)
      scores[criterion.id] = result_.score
      for (const item of result_.evidence) evidence.add(item)
    }
    const weighted = clamp01(BENCHMARK_CRITERIA.reduce((sum, criterion) => sum + (scores[criterion.id] ?? 0) * criterion.weight, 0))
    return { competitor, scores, weighted, evidence: [...evidence], coverage: clamp01(Object.values(scores).filter(score => score > 0.3).length / BENCHMARK_CRITERIA.length) }
  })
}

/** gap score = pain prevalence × severity × unmetness × business fit × evidence confidence. */
export function scoreGap(input: {
  opportunity: string
  painPrevalence: number
  severity: number
  unmetness: number
  businessFit: number
  evidenceConfidence: number
}): GapScore {
  const score = clamp01(input.painPrevalence * input.severity * input.unmetness * input.businessFit * input.evidenceConfidence)
  const components = `pain ${(input.painPrevalence * 100).toFixed(0)}% × severity ${(input.severity * 100).toFixed(0)}% × unmet ${(input.unmetness * 100).toFixed(0)}% × fit ${(input.businessFit * 100).toFixed(0)}% × confidence ${(input.evidenceConfidence * 100).toFixed(0)}%`
  return {
    opportunity: input.opportunity,
    painPrevalence: input.painPrevalence,
    severity: input.severity,
    unmetness: input.unmetness,
    businessFit: input.businessFit,
    evidenceConfidence: input.evidenceConfidence,
    score,
    components,
    coverage: input.evidenceConfidence >= 0.6 ? 'direct evidence' : 'partial evidence',
  }
}

/** Every recommendation follows the recommendation contract and becomes an experiment. */
export function recommendationContract(input: {
  evidence: string[]
  observedGap: string
  hypothesis: string
  expectedOutcome: string
  effort?: 'low' | 'medium' | 'high'
  risk?: 'low' | 'medium' | 'high'
  weeks?: number
}): Recommendation {
  const weeks = Math.min(4, Math.max(2, input.weeks ?? 3))
  return {
    id: `rec:${input.hypothesis.slice(0, 40)}`,
    evidence: input.evidence,
    observedGap: input.observedGap,
    hypothesis: input.hypothesis,
    expectedOutcome: input.expectedOutcome,
    effort: input.effort ?? 'medium',
    risk: input.risk ?? 'medium',
    experiment: {
      weeks,
      design: `Run a ${weeks}-week bounded test of the hypothesis with a fixed offer and a stated comparison group.`,
      successSignal: input.expectedOutcome,
      failureSignal: 'No measurable change against the comparison group by the end of the window.',
    },
  }
}

/**
 * Ticket 13: Benchmark & Strategy Analyst.
 * Structured evidence in, weighted benchmark and scored gaps out. Extra research
 * only closes a Director-authorized critical gap.
 */
export function createBenchmarkStrategy(options: { authorizedGaps?: string[] } = {}): Subagent {
  return {
    name: agentForTrack('benchmark_strategy'),
    track: 'benchmark_strategy',
    role: 'subagent',
    skill: 'egypt-benchmark-strategy',
    async run(context: WorkerContext, budget): Promise<WorkerResult> {
      const brief: ResearchBrief = context.brief
      const prior = context.prior
      const competitor = prior.get('competitor_commercial')
      const audience = prior.get('customer_audience')
      const positioning = prior.get('brand_positioning')
      const usage = { calls: 0, pages: 0, tokens: 0, credits: 0 }
      const sources = new Map<string, WorkerResult['sources'][number]>()
      const observations = [
        ...(competitor?.observations ?? []),
        ...(audience?.observations ?? []),
        ...(positioning?.observations ?? []),
      ]
      for (const track of ['market_demand', 'competitor_commercial', 'customer_audience'] as const) {
        for (const source of prior.get(track)?.sources ?? []) sources.set(source.id, source)
      }

      const competitors = uniqueBy((competitor?.entities ?? prior.get('market_demand')?.entities ?? []).map(entity => entity.name), name => name.toLowerCase()).slice(0, 8)
      const benchmark = buildBenchmark(competitors, observations, brief)
      const gaps = [
        scoreGap({ opportunity: 'Transparent landed pricing', painPrevalence: 0.6, severity: 0.6, unmetness: 0.7, businessFit: 0.8, evidenceConfidence: observations.some(item => item.kind === 'price') ? 0.75 : 0.3 }),
        scoreGap({ opportunity: 'Proof before purchase', painPrevalence: 0.5, severity: 0.55, unmetness: 0.65, businessFit: 0.7, evidenceConfidence: observations.some(item => /guarantee|ضمان/i.test(item.quote)) ? 0.7 : 0.3 }),
      ].sort((a, b) => b.score - a.score)

      const authorized = (options.authorizedGaps ?? []).filter(gap => gap.trim().length > 2)
      if (authorized.length && !context.ledger.exhausted) {
        const gathered = await gather(context, {
          family: 'semantic',
          queries: authorized.slice(0, 2),
          sector: brief.businessProfile.sector,
          geography: brief.geography.label,
          maxOpen: Math.min(2, budget.pages),
          minResults: 3,
        })
        usage.calls += gathered.usage.calls
        usage.pages += gathered.usage.pages
        usage.tokens += gathered.usage.tokens
        usage.credits += gathered.usage.credits
        for (const source of gathered.sources) sources.set(source.id, source)
      }

      const recommendations = gaps.slice(0, 2).map(gap => recommendationContract({
        evidence: observations.filter(item => item.quote.toLowerCase().includes(gap.opportunity.split(' ')[0].toLowerCase())).map(item => item.quote).slice(0, 2),
        observedGap: `${gap.opportunity} (gap score ${gap.score})`,
        hypothesis: `If we make ${gap.opportunity.toLowerCase()} measurable for ${brief.businessProfile.audience}, inquiries increase.`,
        expectedOutcome: 'A measurable lift in qualified inquiries within the experiment window.',
      }))

      const claims: WorkerClaim[] = [
        makeClaim({
          id: 'benchmark',
          statement: `${benchmark.length} competitors were benchmarked on ${BENCHMARK_CRITERIA.length} weighted criteria with visible components.`,
          kind: 'benchmark',
          evidence: observations.filter(item => item.kind === 'observation'),
          sources: [...sources.values()],
          geography: brief.geography.label,
        }),
        makeClaim({
          id: 'top-gap',
          statement: gaps[0] ? `Top opportunity: ${gaps[0].opportunity} (gap score ${gaps[0].score}, ${gaps[0].components}).` : 'No opportunity could be scored.',
          kind: 'opportunity',
          evidence: observations.filter(item => item.kind === 'observation'),
          sources: [...sources.values()],
          geography: brief.geography.label,
        }),
      ]

      return result({
        track: 'benchmark_strategy',
        summary: `${benchmark.length} benchmark row(s), ${gaps.length} scored gap(s), ${recommendations.length} validation experiment(s).`,
        sources: [...sources.values()],
        observations,
        usage,
        coverageGaps: [
          'Scores are hypotheses from captured evidence, not guaranteed strategies.',
          ...gaps.filter(gap => gap.evidenceConfidence < 0.5).map(gap => `Low confidence on ${gap.opportunity}; treat as a hypothesis.`),
        ],
        claims,
      })
    },
  }
}

export function benchmarkCsv(rows: BenchmarkRow[]): string {
  const header = ['competitor', ...BENCHMARK_CRITERIA.map(criterion => criterion.id), 'weighted', 'coverage'].join(',')
  const body = rows.map(row => [row.competitor, ...BENCHMARK_CRITERIA.map(criterion => row.scores[criterion.id] ?? 0), row.weighted, row.coverage].join(','))
  return [header, ...body].join('\n')
}