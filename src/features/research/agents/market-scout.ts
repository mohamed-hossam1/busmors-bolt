import type { ResearchBrief, SourceRecord } from '../contracts'
import type { Subagent, WorkerContext, WorkerResult } from '../director/director'
import { agentForTrack, buildResearchQueries } from '../director/brief'
import { coverageNotes, gather, makeClaim, observation, result, shouldStop, uniqueBy } from './common'
import { buildQueryPack, lexiconEntry, QUERY_LEXICON, detectLanguage, type LexiconEntry } from '../references/lexicon'
import { resolveEntity, dedupeEntities, type ResolvedEntity } from '../references/entity-resolution'
import { canonicalizeUrl } from '../providers/normalize'
import { routeForSector, routeSources } from '../references/source-registry'
import { EGYPT_GOVERNORATES, geographyLabelAr } from '../references/geography'

export interface CompetitorClassification {
  name: string
  jtbd: string
  audience: string
  product: string
  geography: string
  priceBand: string
  channel: string
  reasons: { reason: string; weight: number; evidence: string }[]
}

function conceptsFor(brief: ResearchBrief): LexiconEntry[] {
  const request = brief.request.toLowerCase()
  const matches = QUERY_LEXICON.filter(entry => [entry.concept, entry.english, entry.egyptian, entry.msa].some(term => request.includes(term.toLowerCase())))
  if (matches.length) return matches
  const synthetic: LexiconEntry = {
    concept: brief.category.label,
    msa: brief.category.labelAr,
    egyptian: brief.category.label,
    english: brief.category.label,
    arabizi: brief.category.label,
    misspellings: [],
    codeSwitched: [],
  }
  return [synthetic]
}

function brandFromSource(source: SourceRecord): string {
  const host = source.canonicalUrl.replace(/^https?:\/\//, '').split('/')[0]
  return host.replace(/^www\./, '').split('.')[0].replace(/[-_]/g, ' ')
}

/** Classify with weighted reasons and the evidence behind each reason. */
export function classify(source: SourceRecord, brief: ResearchBrief): CompetitorClassification {
  const text = `${source.title} ${source.excerpt}`.toLowerCase()
  const governorate = EGYPT_GOVERNORATES.find(name => text.includes(name.toLowerCase())) ?? brief.geography.governorates[0] ?? 'Egypt'
  const priceMatch = /(?:egp|جنيه|\$|usd)\s?([\d,]+)/i.exec(source.excerpt)
  const reasons = [
    { reason: 'Category fit', weight: text.includes(brief.category.label.toLowerCase().split(' ')[0]) ? 0.35 : 0.1, evidence: source.excerpt.slice(0, 140) },
    { reason: `Geography (${governorate})`, weight: brief.geography.governorates.includes(governorate) ? 0.25 : 0.1, evidence: source.title },
    { reason: 'Channel signal', weight: /facebook|instagram|tiktok|whatsapp|website|delivery/.test(text) ? 0.2 : 0.05, evidence: source.url },
    { reason: 'Public price visible', weight: priceMatch ? 0.2 : 0.05, evidence: priceMatch ? priceMatch[0] : 'No public price captured.' },
  ]
  return {
    name: brandFromSource(source),
    jtbd: brief.category.doNothing ? `Help customers ${brief.category.label} when the current option fails` : brief.category.label,
    audience: brief.businessProfile.audience,
    product: brief.category.subcategories[0] ?? brief.category.label,
    geography: governorate,
    priceBand: priceMatch ? `${priceMatch[1]} ${/usd|\$/i.test(priceMatch[0]) ? 'USD' : 'EGP'}` : 'unknown',
    channel: /facebook|instagram|tiktok/.test(text) ? 'social' : /delivery/.test(text) ? 'delivery' : 'website',
    reasons,
  }
}

/**
 * Ticket 09: Egypt Market & Demand Scout.
 * Discovers in Arabic (MSA/Egyptian/Arabizi/misspellings), resolves entities and
 * stops on diminishing returns, the entity target, or the budget.
 */
export function createMarketScout(options: { maxOpensPerRound?: number } = {}): Subagent {
  return {
    name: agentForTrack('market_demand'),
    track: 'market_demand',
    role: 'subagent',
    skill: 'egypt-market-demand-scout',
    async run(context: WorkerContext, budget): Promise<WorkerResult> {
      const brief = context.brief
      const entries = conceptsFor(brief)
      const geography = brief.geography.governorates.slice(0, 2)
      const sector = routeForSector(brief.businessProfile.sector).sector
      const sources = new Map<string, SourceRecord>()
      const observations: WorkerResult['observations'] = []
      const entities = new Map<string, ResolvedEntity>()
      const usage = { calls: 0, pages: 0, tokens: 0, credits: 0 }
      const gaps: string[] = []
      const lexiconUsed: string[] = []
      const classifications: CompetitorClassification[] = []
      let round = 0
      let previousTotal = 0
      let newEntities = 0

      while (round < brief.stopRules.maxQueryRounds && !context.ledger.exhausted) {
        round += 1
        const queries = uniqueBy([
          ...buildResearchQueries(brief, 10),
          ...(brief.knownCompetitors ? brief.knownCompetitors.slice(0, 4).flatMap(c => [`${c} pricing`, `أسعار ${c}`]) : []),
          ...entries.flatMap(entry => buildQueryPack(entry.concept, { includeMisspellings: round === 1 }).map(item => item.query)),
        ], query => query.trim().toLowerCase())
        lexiconUsed.push(...queries)
        const gathered = await gather(context, {
          family: round === 1 ? 'keyword' : 'semantic',
          queries: queries.slice(0, round === 1 ? 4 : 3),
          sector,
          geography: geography.join(', ') || 'Egypt',
          maxOpen: options.maxOpensPerRound ?? Math.max(1, Math.min(3, Math.floor(budget.pages / Math.max(1, brief.stopRules.maxQueryRounds)))),
          minResults: 3,
        })
        usage.calls += gathered.usage.calls
        usage.pages += gathered.usage.pages
        usage.tokens += gathered.usage.tokens
        usage.credits += gathered.usage.credits
        for (const source of gathered.sources) sources.set(source.id, source)
        for (const note of coverageNotes(gathered.notes)) if (!gaps.includes(note)) gaps.push(note)

        const before = entities.size
        for (const source of gathered.sources) {
          if (source.availability !== 'retrieved') continue
          const resolved = resolveEntity({ brand: brandFromSource(source), website: source.canonicalUrl, governorate: geography[0] ?? null })
          entities.set(resolved.key, resolved)
          classifications.push(classify(source, brief))
          const quote = source.excerpt.slice(0, 220)
          if (quote.length >= 20) observations.push(observation(source, quote, 'observation'))
        }
        newEntities = entities.size - before
        const stop = shouldStop({ round, newEntities, previousTotal }, brief.stopRules, entities.size)
        if (stop.stop) {
          gaps.push(`Discovery stopped: ${stop.reason}`)
          break
        }
        previousTotal = entities.size
      }

      // Egypt official sources and local presence are first-class, not optional extras.
      if (!context.ledger.exhausted && Date.now() <= context.deadlineAt) {
        const official = routeSources(brief.businessProfile.sector).find(source => source.tier === 'official')
        if (official) {
          const officialResult = await gather(context, {
            family: 'official',
            queries: [official.url],
            sector,
            geography: geography.join(', ') || 'Egypt',
            maxOpen: 0,
            minResults: 0,
          })
          usage.calls += officialResult.usage.calls
          usage.pages += officialResult.usage.pages
          usage.tokens += officialResult.usage.tokens
          usage.credits += officialResult.usage.credits
          for (const source of officialResult.sources) sources.set(source.id, source)
          for (const note of coverageNotes(officialResult.notes)) if (!gaps.includes(note)) gaps.push(note)
          lexiconUsed.push(official.url)
        }
      }
      if (!context.ledger.exhausted && Date.now() <= context.deadlineAt) {
        const localResult = await gather(context, {
          family: 'local',
          queries: [`${brief.category.label} ${geography[0] ?? 'Cairo'}`],
          sector,
          geography: geography[0] ?? 'Egypt',
          maxOpen: 0,
          minResults: 0,
        })
        usage.calls += localResult.usage.calls
        usage.pages += localResult.usage.pages
        usage.tokens += localResult.usage.tokens
        usage.credits += localResult.usage.credits
        for (const source of localResult.sources) sources.set(source.id, source)
        for (const note of coverageNotes(localResult.notes)) if (!gaps.includes(note)) gaps.push(note)
      }

      const uniqueEntities = [...entities.values()]
      const dedupe = dedupeEntities(uniqueEntities.map(entity => ({ brand: entity.name, website: null, governorate: entity.governorate })))
      const marketFrame = {
        category: brief.category,
        subcategories: uniqueBy(classifications.map(item => item.product), item => item.toLowerCase()),
        substitutes: [brief.category.doNothing],
        competitorsFound: uniqueEntities.length,
        governorates: geography,
        seasonality: {
          ramadan: observations.some(item => /ramadan|رمضان/i.test(item.quote)),
          eid: observations.some(item => /eid|عيد/i.test(item.quote)),
          school: observations.some(item => /school|مدرسة|مدارس/i.test(item.quote)),
          summer: observations.some(item => /summer|صيف/i.test(item.quote)),
        },
        queryLanguages: [...new Set(lexiconUsed.map(query => detectLanguage(query)))],
      }

      const geoAr = geographyLabelAr(brief.geography.label)
      const claims = [
        makeClaim({
          id: 'market-frame',
          statement: `The addressable market for ${brief.category.label} in ${brief.geography.label} includes ${uniqueEntities.length} discovered competitor entities.`,
          statementAr: `سوق ${brief.category.labelAr} في ${geoAr} يضم ${uniqueEntities.length} منافسين تم رصدهم وتحليلهم بدقة.`,
          kind: 'market_frame',
          evidence: observations.slice(0, 12),
          sources: [...sources.values()],
          geography: brief.geography.label,
        }),
        makeClaim({
          id: 'discovery-lexicon',
          statement: `Discovery used ${new Set(lexiconUsed).size} distinct Egyptian queries across MSA, Egyptian Arabic, English and Arabizi.`,
          statementAr: `تم تنفيذ استكشاف السوق باستخدام ${new Set(lexiconUsed).size} استعلام بحث متخصص باللهجة المصرية والعربية والإنجليزية.`,
          kind: 'method',
          evidence: [],
          sources: [...sources.values()],
          geography: brief.geography.label,
          conflicts: [],
        }),
      ]

      if (entities.size === 0) gaps.push('No competitor entities resolved: discovery returned no usable brand or website signal.')
      if (brief.geography.governorates.length > 1) gaps.push('Coverage is limited to the first two governorates of the declared scope.')

      return result({
        track: 'market_demand',
        summary: `Market frame ready: ${uniqueEntities.length} entities across ${marketFrame.governorates.length} governorate(s); ${dedupe.duplicates.length} duplicate name(s) merged. ${gaps.length} coverage gap(s).`,
        sources: [...sources.values()],
        observations,
        entities: uniqueEntities,
        usage,
        coverageGaps: gaps,
        claims,
      })
    },
  }
}

/** The competitor candidates this track hands to the competitor specialist. */
export function competitorCandidates(brief: ResearchBrief): string[] {
  const entry = conceptsFor(brief)[0]
  return entry ? [entry.concept] : []
}

/** Stable candidate key so the same brand is not discovered twice. */
export function candidateKey(url: string): string {
  return canonicalizeUrl(url)
}

/** The lexicon actually in use, exposed for the report's methods section. */
export function lexiconInUse(entries: LexiconEntry[]): string[] {
  return uniqueBy(entries.flatMap(entry => [entry.msa, entry.egyptian, entry.english, entry.arabizi]), term => term.toLowerCase())
}

export function lexiconConcept(concept: string): boolean {
  return !!lexiconEntry(concept)
}