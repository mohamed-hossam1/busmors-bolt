import type {
  BusinessProfile,
  ResearchBrief,
  ResearchBudget,
  ResearchLanguage,
  ResearchMode,
  ResearchTrack,
  VisibleAgentEvent,
} from '../contracts'
import { queryLanguageOrder } from '../contracts'
import { budgetFor, TRACK_BUDGET_WEIGHT } from '../policy'
import { EGYPT_GOVERNORATES, scopeFromGovernorates } from '../references/geography'
import { QUERY_LEXICON, detectLanguage } from '../references/lexicon'
import { routeForSector } from '../references/source-registry'

const COMPETITOR_WORDS = ['competitor', 'competitors', 'rival', 'alternatives', 'pricing', 'price', 'prices', 'offer', 'offers', 'منافس', 'المنافسين', 'أسعار', 'اسعار', 'سعر', 'بكام', 'عروض']
const AUDIENCE_WORDS = ['audience', 'customer', 'customers', 'voice of customer', 'reviews', 'complaints', 'segment', 'segments', 'جمهور', 'عملاء', 'تقييمات', 'شكاوي', 'شكاوى']
const BRAND_WORDS = ['positioning', 'brand', 'messaging', 'differentiation', 'تمايز', 'العلامة', 'البراند', 'موقع']
const STRATEGY_WORDS = ['benchmark', 'strategy', 'opportunity', 'recommend', 'gap', 'استراتيجية', 'فرصة', 'توصية']

export const ALL_TRACKS: readonly ResearchTrack[] = Object.freeze([
  'market_demand',
  'competitor_commercial',
  'customer_audience',
  'brand_positioning',
  'benchmark_strategy',
])

export const TRACK_LABELS: Readonly<Record<ResearchTrack, string>> = Object.freeze({
  market_demand: 'Market & Demand Scout',
  competitor_commercial: 'Competitor & Commercial Intelligence',
  customer_audience: 'Customer & Audience Intelligence',
  brand_positioning: 'Brand & Positioning Intelligence',
  benchmark_strategy: 'Benchmark & Strategy Analyst',
})

const containsAny = (text: string, words: string[]) => {
  const normalized = text.toLowerCase()
  return words.some(word => normalized.includes(word))
}

/** Dynamic track selection: a quick brief never runs the full battery. */
export function selectTracks(request: string, mode: ResearchMode): ResearchTrack[] {
  if (mode === 'quick') {
    const track: ResearchTrack = containsAny(request, COMPETITOR_WORDS) ? 'competitor_commercial' : 'market_demand'
    return [track]
  }
  const selected = new Set<ResearchTrack>(['market_demand'])
  if (mode === 'standard') {
    selected.add('competitor_commercial')
    selected.add('customer_audience')
    if (containsAny(request, COMPETITOR_WORDS)) selected.add('competitor_commercial')
    if (containsAny(request, BRAND_WORDS)) selected.add('brand_positioning')
  } else {
    for (const track of ALL_TRACKS) selected.add(track)
  }
  if (containsAny(request, AUDIENCE_WORDS)) selected.add('customer_audience')
  if (containsAny(request, COMPETITOR_WORDS)) selected.add('competitor_commercial')
  if (containsAny(request, STRATEGY_WORDS)) selected.add('benchmark_strategy')
  if (containsAny(request, BRAND_WORDS)) selected.add('brand_positioning')
  return ALL_TRACKS.filter(track => selected.has(track))
}

/** A usable category label from the description/request, not just the sector. */
export function inferCategory(text: string, sector: string): { label: string; labelAr: string } {
  const lower = text.toLowerCase()
  const exact = QUERY_LEXICON.find(item => [item.english, item.egyptian, item.msa, item.arabizi].some(term => term && term.length > 3 && lower.includes(term.toLowerCase())))
  if (exact) return { label: exact.concept, labelAr: exact.msa }
  const token = QUERY_LEXICON.find(item => item.concept.split(/\s+/).some(word => word.length >= 5 && lower.includes(word)))
  if (token) return { label: token.concept, labelAr: token.msa }
  return { label: sector.replace(/_/g, ' '), labelAr: sectorLabelAr(sector) }
}

export interface BriefInput {
  request: string
  mode: ResearchMode
  profile: BusinessProfile
  now?: Date
}

/** Turn a query into a ResearchBrief. No retrieval happens here. */
export function buildBrief(input: BriefInput): ResearchBrief {
  const now = (input.now ?? new Date()).toISOString()
  const trackList = selectTracks(input.request, input.mode)
  const budget = allocateBudget(input.mode, trackList)
  const governorates = input.profile.governorates.length ? input.profile.governorates : inferGovernorates(input.request)
  const sector = routeForSector(input.profile.sector).sector
  const category = inferCategory(`${input.profile.description} ${input.request}`, sector)
  return {
    id: `brief:${hashBrief(input.request + input.mode + now)}`,
    mode: input.mode,
    request: input.request,
    businessProfile: input.profile,
    category: {
      label: category.label,
      labelAr: category.labelAr,
      subcategories: [],
      substitutes: [],
      doNothing: 'Do nothing: keep the current provider and accept the current outcome.',
    },
    queryLanguages: queryLanguageOrder(input.request),
    geography: scopeFromGovernorates(governorates, input.profile.description),
    tracks: trackList,
    budget,
    stopRules: {
      maxQueryRounds: input.mode === 'deep' ? 2 : 1,
      minNewEntityPercent: 0.05,
      entityTarget: input.mode === 'quick' ? 8 : input.mode === 'standard' ? 14 : 24,
    },
    createdAt: now,
  }
}

/** The brief carries the whole run budget; per-track splits live on the plan. */
export function allocateBudget(mode: ResearchMode, tracks: ResearchTrack[]): ResearchBudget {
  void tracks
  return budgetFor(mode)
}

/** Per-track budget split derived from the brief, used by the plan. */
export function trackBudgets(brief: ResearchBrief): Record<string, ResearchBudget> {
  const activeWeight = brief.tracks.reduce((sum, track) => sum + (TRACK_BUDGET_WEIGHT[track] ?? 0.1), 0) || 1
  const result: Record<string, ResearchBudget> = {}
  let remaining = { ...brief.budget }
  brief.tracks.forEach((track, index) => {
    const share = (TRACK_BUDGET_WEIGHT[track] ?? 0.1) / activeWeight
    const last = index === brief.tracks.length - 1
    const budget: ResearchBudget = {
      calls: last ? remaining.calls : Math.max(1, Math.floor(brief.budget.calls * share)),
      pages: last ? remaining.pages : Math.max(1, Math.floor(brief.budget.pages * share)),
      tokens: last ? remaining.tokens : Math.max(500, Math.floor(brief.budget.tokens * share)),
      seconds: brief.budget.seconds,
      credits: last ? remaining.credits : Math.max(1, Math.floor(brief.budget.credits * share)),
    }
    remaining = { calls: remaining.calls - budget.calls, pages: remaining.pages - budget.pages, tokens: remaining.tokens - budget.tokens, seconds: remaining.seconds, credits: remaining.credits - budget.credits }
    result[track] = budget
  })
  return result
}

export interface PlanStep {
  track: ResearchTrack
  agent: string
  label: string
  dependsOn: ResearchTrack[]
  budget: ResearchBudget
}

/** Dependencies keep the run honest: positioning needs competitor and audience work. */
const DEPENDENCIES: Readonly<Record<ResearchTrack, readonly ResearchTrack[]>> = Object.freeze({
  market_demand: [],
  competitor_commercial: ['market_demand'],
  customer_audience: ['market_demand'],
  brand_positioning: ['competitor_commercial', 'customer_audience'],
  benchmark_strategy: ['market_demand', 'competitor_commercial', 'customer_audience', 'brand_positioning'],
})

export function planTracks(brief: ResearchBrief): PlanStep[] {
  const budgets = trackBudgets(brief)
  return brief.tracks.map(track => ({
    track,
    agent: agentForTrack(track),
    label: TRACK_LABELS[track],
    dependsOn: DEPENDENCIES[track].filter(dependency => brief.tracks.includes(dependency)),
    budget: budgets[track],
  }))
}

export function agentForTrack(track: ResearchTrack): string {
  switch (track) {
    case 'market_demand': return 'market_scout'
    case 'competitor_commercial': return 'competitor_intelligence'
    case 'customer_audience': return 'audience_intelligence'
    case 'brand_positioning': return 'brand_positioning'
    case 'benchmark_strategy': return 'benchmark_strategy'
  }
}

/** Dependency layers, each layer runnable with up to three concurrent retrievals. */
export function planLayers(plan: PlanStep[]): PlanStep[][] {
  const layers: PlanStep[][] = []
  const placed = new Set<ResearchTrack>()
  let remaining = [...plan]
  while (remaining.length) {
    const ready = remaining.filter(step => step.dependsOn.every(dependency => placed.has(dependency)))
    if (!ready.length) {
      layers.push(remaining)
      break
    }
    layers.push(ready)
    for (const step of ready) placed.add(step.track)
    remaining = remaining.filter(step => !placed.has(step.track))
  }
  return layers
}

/** Run tasks with a fixed concurrency ceiling (three retrievals). */
export async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number, onStart?: (index: number) => void): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let cursor = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= tasks.length) return
      onStart?.(index)
      results[index] = await tasks[index]()
    }
  })
  await Promise.all(workers)
  return results
}

export interface EmitEvent {
  (event: Omit<VisibleAgentEvent, 'id' | 'seq'>): Promise<VisibleAgentEvent>
}

function sectorLabelAr(sector: string): string {
  const labels: Record<string, string> = {
    construction: 'التشييد والبناء',
    retail: 'التجزئة',
    professional_service: 'الخدمات المهنية',
    b2b: 'التجارة بين الشركات',
    education: 'التعليم',
    health: 'الصحة',
    restaurants: 'المطاعم',
    real_estate: 'العقارات',
    saas: 'برمجيات كخدمة',
    fmcg: 'المنتجات الاستهلاكية السريعة',
  }
  return labels[sector] ?? sector
}

export function hashBrief(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index++) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0
  return Math.abs(hash).toString(36)
}

/** The language of the request decides report ordering and the lexicon used. */
export function requestLanguages(request: string): ResearchBrief['queryLanguages'] {
  return queryLanguageOrder(request) as ResearchBrief['queryLanguages']
}

/** Governorate names mentioned in the request, when the profile does not say. */
export function inferGovernorates(request: string): string[] {
  const lower = request.toLowerCase()
  return EGYPT_GOVERNORATES.filter(name => lower.includes(name.toLowerCase()) || (name === 'Cairo' && /القاهرة/.test(request)) || (name === 'Giza' && /الجيزة/.test(request)))
}

/**
 * Business-specific search queries derived from the brand, category, audience
 * and geography. These replace generic "competitors in Egypt" style queries so
 * retrieval starts from the actual business (e.g. "Man el Nasr") rather than a
 * broad category. Brand and category terms are prioritised first.
 */
export function buildResearchQueries(brief: ResearchBrief, limit = 8): string[] {
  const brand = (brief.businessProfile.name ?? '').trim()
  const category = brief.category.label.trim()
  const categoryAr = brief.category.labelAr.trim()
  const audience = (brief.businessProfile.audience ?? '').trim()
  const governorates = brief.geography.governorates.slice(0, 3)
  const geo = governorates[0] ?? brief.geography.label
  const request = brief.request.trim()

  const candidates: string[] = []
  if (brand) {
    candidates.push(brand)
    candidates.push(`${brand} competitors`)
    candidates.push(`${brand} competitors ${geo}`.trim())
    if (category) candidates.push(`${brand} ${category} ${geo}`.trim())
  }
  if (request && request.toLowerCase() !== brand.toLowerCase() && request.length <= 80) {
    candidates.push(request)
  }
  if (category) {
    candidates.push(`${category} ${geo}`.trim())
    for (const governorate of governorates.slice(1)) candidates.push(`${category} ${governorate}`.trim())
    if (audience) candidates.push(`${category} ${audience}`.trim())
    if (categoryAr) candidates.push(`${categoryAr} ${geo}`.trim())
  }

  const seen = new Set<string>()
  const output: string[] = []
  for (const candidate of candidates) {
    const key = candidate.replace(/\s+/g, ' ').trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(candidate.replace(/\s+/g, ' ').trim())
    if (output.length >= limit) break
  }
  return output
}

export function detectRequestLanguage(request: string): ResearchLanguage | 'mixed' {
  return detectLanguage(request)
}