import type { ResearchBrief, SourceRecord } from '../contracts'
import type { Subagent, WorkerContext, WorkerResult } from '../director/director'
import { agentForTrack } from '../director/brief'
import { coverageNotes, gather, makeClaim, observation, result, uniqueBy } from './common'
import { classify, type CompetitorClassification } from './market-scout'
import {
  classifyOffers,
  compareLandedPrices,
  landedPrice,
  normalizePriceObservation,
  parsePackSize,
  parsePriceText,
  type PriceObservation,
} from '../references/pricing'
import { routeForSector } from '../references/source-registry'

export interface CompetitorProfile {
  name: string
  sourceId: string
  sourceUrl: string
  ownership: string
  branches: string[]
  governorates: string[]
  audience: string
  portfolio: string[]
  channels: string[]
  partners: string[]
  proofPoints: string[]
  regulatorySignals: string[]
  classification: CompetitorClassification
}

export interface PriceEvidence {
  observation: PriceObservation
  landed: ReturnType<typeof landedPrice>
  comparableWith: string[]
}

function profileFromSource(source: SourceRecord, brief: ResearchBrief): CompetitorProfile {
  const text = `${source.title} ${source.excerpt}`
  const classification = classify(source, brief)
  return {
    name: classification.name,
    sourceId: source.id,
    sourceUrl: source.url,
    ownership: /(?:limited|l\.l\.c|s\.a\.e|شركة|مصنع)/i.test(text) ? 'Private company' : 'Undisclosed',
    branches: [],
    governorates: [classification.geography],
    audience: brief.businessProfile.audience,
    portfolio: uniqueBy([brief.category.label, ...brief.category.subcategories], item => item.toLowerCase()),
    channels: [classification.channel],
    partners: [],
    proofPoints: source.excerpt ? [source.excerpt.slice(0, 160)] : [],
    regulatorySignals: /(?:license|licence|ترخيص|وزارة|هيئة|قانون)/i.test(text) ? ['References a licence or regulator'] : [],
    classification,
  }
}

/** A delivery fee changes the landed price; a missing fee is 0, never guessed. */
function deliveryFeeFrom(line: string): number {
  if (/(?:free delivery|شحن مجاني|توصيل مجاني)/i.test(line)) return 0
  const match = /(?:delivery|توصيل|شحن)[^0-9\u0660-\u0669]{0,14}([0-9][0-9,]*)/i.exec(line)
  if (!match) return 0
  return parsePriceText(match[1])?.amount ?? 0
}

function priceObservations(sources: SourceRecord[], brief: ResearchBrief): PriceEvidence[] {
  const rows: PriceEvidence[] = []
  for (const source of sources) {
    if (source.availability !== 'retrieved') continue
    const lines = source.excerpt.split(/(?:\n|Look|•)/).map(line => line.trim()).filter(Boolean).slice(0, 8)
    for (const line of lines) {
      const parsed = parsePriceText(line)
      if (!parsed) continue
      const pack = parsePackSize(line)
      const observation = normalizePriceObservation({
        competitor: source.canonicalUrl.replace(/^https?:\/\//, '').split('/')[0],
        product: line.slice(0, 120),
        packSize: pack?.label ?? null,
        listPrice: parsed.amount,
        vatIncluded: /(?:including vat|شامل الضريبة|شامل ضريبة)/i.test(line),
        deliveryFee: deliveryFeeFrom(line),
        codAvailable: /(?:cash on delivery|عند الاستلام)/i.test(line),
        installments: /(?:تقسيط|installment)/i.test(line) ? { months: 6, monthly: Math.round(parsed.amount / 6) } : null,
        availability: /(?:out of stock|غير متوفر)/i.test(line) ? 'out_of_stock' : 'in_stock',
        channel: brief.businessProfile.channels[0] ?? 'website',
        governorate: source.geography,
        capturedAt: source.capturedAt,
        validUntil: null,
        offers: classifyOffers(line),
        sourceId: source.id,
        rawText: line,
      })
      rows.push({ observation, landed: landedPrice(observation, pack), comparableWith: [] })
    }
  }
  return rows
}

/**
 * Ticket 10: Competitor & Commercial Intelligence.
 * Consumes the scout's entity registry, normalises products and prices, and
 * compares landed prices (VAT, delivery, pack size) instead of displayed numbers.
 */
export function createCompetitorIntelligence(): Subagent {
  return {
    name: agentForTrack('competitor_commercial'),
    track: 'competitor_commercial',
    role: 'subagent',
    skill: 'egypt-competitor-commercial',
    async run(context: WorkerContext, budget): Promise<WorkerResult> {
      const brief: ResearchBrief = context.brief
      const prior = context.prior.get('market_demand')
      const sector = routeForSector(brief.businessProfile.sector).sector
      const geography = brief.geography.governorates.join(', ') || 'Egypt'
      const usage = { calls: 0, pages: 0, tokens: 0, credits: 0 }
      const sources = new Map<string, SourceRecord>()
      const observations: WorkerResult['observations'] = []
      const gaps: string[] = []

      const queries = uniqueBy([
        ...brief.tracks.includes('market_demand') && prior ? prior.entities.slice(0, 4).map(entity => `${entity.name} price`) : [],
        `${brief.category.label} price \u0645\u0635\u0631`,
        `${brief.category.label} \u0623\u0633\u0639\u0627\u0631`,
        `${brief.category.label} offers \u0639\u0631\u0648\u0636`,
      ], query => query.toLowerCase())

      const gathered = await gather(context, {
        family: 'keyword',
        queries: queries.slice(0, 3),
        sector,
        geography,
        maxOpen: Math.max(1, Math.min(3, Math.floor(budget.pages * 0.5))),
        minResults: 3,
      })
      usage.calls += gathered.usage.calls
      usage.pages += gathered.usage.pages
      usage.tokens += gathered.usage.tokens
      usage.credits += gathered.usage.credits
      for (const source of gathered.sources) sources.set(source.id, source)
      for (const note of coverageNotes(gathered.notes)) if (!gaps.includes(note)) gaps.push(note)

      // The scout's opened pages are evidence too; reuse them instead of refetching.
      if (prior) for (const source of prior.sources) if (!sources.has(source.id)) sources.set(source.id, source)
      const allSources = [...sources.values()]
      const profiles = uniqueBy(allSources.filter(source => source.availability === 'retrieved').map(source => profileFromSource(source, brief)), profile => profile.name.toLowerCase())
      const prices = priceObservations(allSources, brief)
      const comparison = compareLandedPrices(prices.map(row => row.observation))
      const bySource = new Map<string, PriceEvidence[]>()
      for (const row of prices) {
        const list = bySource.get(row.observation.sourceId) ?? []
        list.push(row)
        bySource.set(row.observation.sourceId, list)
      }
      for (const [sourceId, rows] of bySource) {
        const names = rows.map(row => row.observation.product)
        for (const row of rows) row.comparableWith = names.filter(name => name !== row.observation.product)
        void sourceId
      }

      for (const source of allSources) {
        if (source.availability !== 'retrieved') continue
        const quote = source.excerpt.slice(0, 220)
        if (quote.length >= 20) observations.push(observation(source, quote, 'observation'))
        for (const row of prices.filter(item => item.observation.sourceId === source.id)) {
          observations.push(observation(source, row.observation.rawText, 'price'))
        }
      }

      const claims = [
        makeClaim({
          id: 'competitor-set',
          statement: `${profiles.length} competitor profiles were built from opened pages for ${brief.category.label}.`,
          kind: 'competitor_landscape',
          evidence: observations.filter(item => item.kind === 'observation'),
          sources: allSources,
          geography: brief.geography.label,
        }),
        makeClaim({
          id: 'landed-price-basis',
          statement: prices.length
            ? `${prices.length} price observation(s) were compared on a landed basis (VAT, delivery and pack size), not the displayed number.`
            : 'No public price observation was captured; price comparison is reported as unknown rather than free or unchanged.',
          kind: 'pricing',
          evidence: observations.filter(item => item.kind === 'price'),
          sources: allSources,
          geography: brief.geography.label,
          conflicts: prices.filter(row => !row.comparableWith.length).slice(0, 3).map(row => `Not comparable: ${row.observation.product}`),
        }),
      ]

      if (!prices.length) gaps.push('No comparable price observations: the price comparison is unknown, not zero.')
      if (prices.some(row => row.landed.vatAdded > 0)) gaps.push('Some observations add Egyptian VAT at 14%; landed totals are used for comparison.')

      return result({
        track: 'competitor_commercial',
        summary: `${profiles.length} competitor profile(s), ${prices.length} price observation(s), ${comparison.length} landed-price comparison(s).`,
        sources: allSources,
        observations,
        entities: prior?.entities ?? [],
        usage,
        coverageGaps: gaps,
        claims,
      })
    },
  }
}

/** The price comparison table rows, exported for synthesis and the report. */
export function priceComparisonTable(rows: PriceEvidence[]): { competitor: string; product: string; displayed: string; landed: string; basis: string }[] {
  return rows.map(row => ({
    competitor: row.observation.competitor,
    product: row.observation.product,
    displayed: `${row.observation.listPrice} EGP`,
    landed: `${row.landed.total} EGP`,
    basis: row.landed.basis,
  }))
}