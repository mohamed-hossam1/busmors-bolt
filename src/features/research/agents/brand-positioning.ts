import type { ResearchBrief, SourceRecord } from '../contracts'
import type { Subagent, WorkerContext, WorkerResult } from '../director/director'
import { agentForTrack } from '../director/brief'
import { makeClaim, result, uniqueBy } from './common'
import { themeOfPublicText } from './themes'

export interface PositioningHypothesis {
  id: string
  statement: string
  statementAr: string | null
  axis: string
  evidence: string[]
  stressTest: { question: string; result: 'holds' | 'weak' | 'fails' }
}

export interface WhiteSpace {
  declared: boolean
  demand: boolean
  competitorWeakness: boolean
  businessAbility: boolean
  proofAndEconomics: boolean
  reasons: string[]
}

/** Perceptual axes come from audience language, not a fixed price/quality grid. */
export function perceptualAxes(vocQuotes: string[]): { axis: string; poles: [string, string]; evidence: string[] }[] {
  const themes = new Map<string, string[]>()
  for (const quote of vocQuotes) {
    const theme = themeOfPublicText(quote)
    const list = themes.get(theme) ?? []
    list.push(quote)
    themes.set(theme, list)
  }
  return [...themes.entries()].map(([theme, quotes]) => ({
    axis: theme,
    poles: theme === 'price' ? ['affordable', 'premium'] as [string, string] : theme === 'trust' ? ['cautious', 'confident'] as [string, string] : ['low', 'high'] as [string, string],
    evidence: quotes.slice(0, 3),
  }))
}

/** White space needs all four conditions, never a single attractive signal. */
export function evaluateWhiteSpace(input: {
  demand: boolean
  competitorWeakness: boolean
  businessAbility: boolean
  proofAndEconomics: boolean
}): WhiteSpace {
  const reasons: string[] = []
  if (!input.demand) reasons.push('No real demand signal in the captured audience evidence.')
  if (!input.competitorWeakness) reasons.push('No competitor weakness or crowding gap was evidenced.')
  if (!input.businessAbility) reasons.push('The business has no demonstrated ability to execute this.')
  if (!input.proofAndEconomics) reasons.push('No plausible proof with testable economics was captured.')
  return { declared: reasons.length === 0, demand: input.demand, competitorWeakness: input.competitorWeakness, businessAbility: input.businessAbility, proofAndEconomics: input.proofAndEconomics, reasons }
}

/**
 * Ticket 12: Brand & Positioning Intelligence.
 * Runs after competitor and audience artifacts exist and derives axes from
 * audience language.
 */
export function createBrandPositioning(): Subagent {
  return {
    name: agentForTrack('brand_positioning'),
    track: 'brand_positioning',
    role: 'subagent',
    skill: 'egypt-brand-positioning',
    async run(context: WorkerContext, budget): Promise<WorkerResult> {
      const brief: ResearchBrief = context.brief
      const prior = context.prior
      const competitor = prior.get('competitor_commercial')
      const audience = prior.get('customer_audience')
      const usage = { calls: 0, pages: 0, tokens: 0, credits: 0 }
      const sources = new Map<string, SourceRecord>()
      for (const track of ['market_demand', 'competitor_commercial', 'customer_audience'] as const) {
        const result_ = prior.get(track)
        if (result_) for (const source of result_.sources) sources.set(source.id, source)
      }
      const observations = [...(competitor?.observations ?? []), ...(audience?.observations ?? [])]
      const quotes = (audience?.observations ?? []).filter(item => item.kind === 'quote').map(item => item.quote)
      const axes = perceptualAxes(quotes)
      const evidenceText = observations.map(item => item.quote).join(' ')

      const currentPosition = /(?:known for|leader|best|الأشهر|معروف|الأفضل)/i.test(evidenceText) ? 'Established category reference' : 'Not yet established in the captured evidence'
      const desiredPosition = `${brief.category.label} that customers trust for ${brief.businessProfile.audience}`
      const parity = brief.category.subcategories.slice(0, 2)
      const difference = uniqueBy([
        ...quotes.filter(quote => /(?:trust|doubt|خوف|ثقة)/i.test(quote)).slice(0, 2),
        ...observations.filter(item => /(?:guarantee|warranty|ضمان)/i.test(item.quote)).map(item => item.quote).slice(0, 2),
      ], quote => quote.slice(0, 40))

      const whitespace = evaluateWhiteSpace({
        demand: quotes.length > 0 && axes.some(axis => axis.evidence.length > 0),
        competitorWeakness: (competitor?.observations.length ?? 0) > 0 && /(?:no|none|not available|غير متاح|مفيش)/i.test(evidenceText),
        businessAbility: brief.businessProfile.channels.length > 0 && brief.businessProfile.governorates.length > 0,
        proofAndEconomics: observations.some(item => /(?:guarantee|warranty|ضمان|price|سعر)/i.test(item.quote)),
      })

      const hypotheses: PositioningHypothesis[] = [
        {
          id: 'pos-trust',
          statement: `Position as the ${brief.category.label} provider that proves quality before purchase.`,
          statementAr: `\u0627\u0644\u062a\u0645\u064a\u0632 \u0643\u0623\u0646\u0646\u0627 \u0646\u0642\u062f\u0645 ${brief.category.labelAr} \u0645\u0639 \u0625\u062b\u0628\u0627\u062a \u0627\u0644\u062c\u0648\u062f\u0629 \u0642\u0628\u0644 \u0627\u0644\u0634\u0631\u0627\u0621.`,
          axis: axes[0]?.axis ?? 'trust',
          evidence: difference.slice(0, 3),
          stressTest: {
            question: 'Do competitors already claim the same proof?',
            result: /(?:same|already|also|نفس)/i.test(evidenceText) ? 'weak' : 'holds',
          },
        },
        {
          id: 'pos-local',
          statement: `Own the ${brief.geography.label} service promise: fast, documented, in-person where it matters.`,
          statementAr: `\u0627\u0644\u062a\u0645\u064a\u0632 \u0639\u0646 \u0637\u0631\u064a\u0642 \u0648\u0639\u062f \u0627\u0644\u062e\u062f\u0645\u0629 \u0641\u064a ${brief.geography.label}.`,
          axis: axes[1]?.axis ?? 'speed',
          evidence: observations.filter(item => /(?:fast|سريع|same day|نفس اليوم)/i.test(item.quote)).map(item => item.quote).slice(0, 3),
          stressTest: {
            question: 'Can the business actually deliver the speed claim?',
            result: brief.businessProfile.channels.length ? 'holds' : 'fails',
          },
        },
      ]

      const claims = [
        makeClaim({
          id: 'category-frame',
          statement: `Category frame: ${brief.category.label} with real alternatives (${parity.join(', ') || 'not yet evidenced'}). Current position: ${currentPosition}. Desired position: ${desiredPosition}.`,
          kind: 'positioning_frame',
          evidence: observations.filter(item => item.kind === 'observation'),
          sources: [...sources.values()],
          geography: brief.geography.label,
        }),
        makeClaim({
          id: 'perceptual-axes',
          statement: `Perceptual axes derived from ${quotes.length} audience quote(s): ${axes.map(axis => axis.axis).join(', ') || 'none available'}.`,
          kind: 'perceptual_map',
          evidence: observations.filter(item => item.kind === 'quote'),
          sources: [...sources.values()],
          geography: brief.geography.label,
        }),
        makeClaim({
          id: 'white-space',
          statement: whitespace.declared
            ? 'A white-space opportunity is declared: demand, competitor weakness, business ability and testable economics all hold.'
            : `No white space is declared. ${whitespace.reasons.join(' ')}`,
          kind: 'white_space',
          evidence: observations.filter(item => item.kind === 'observation'),
          sources: [...sources.values()],
          geography: brief.geography.label,
        }),
      ]

      const gaps: string[] = []
      if (!whitespace.declared) gaps.push('White space not declared: all four evidence conditions must hold.')
      if (quotes.length === 0) gaps.push('No audience quotes: perceptual axes are provisional.')
      if (budget.calls <= 0) gaps.push('No budget left for positioning research; this track used prior artifacts only.')

      return result({
        track: 'brand_positioning',
        summary: `${hypotheses.length} positioning hypotheses, ${axes.length} perceptual axes, white space ${whitespace.declared ? 'declared' : 'not declared'}.`,
        sources: [...sources.values()],
        observations,
        usage,
        coverageGaps: gaps,
        claims,
      })
    },
  }
}

/** Current vs desired position, shown as evidence rather than a slogan. */
export function positionCanvas(input: { current: string; desired: string; parity: string[]; difference: string[] }): { current: string; desired: string; parity: string[]; difference: string[] } {
  return input
}

/** A positioning hypothesis is only published when the category frame claim exists. */
export function positioningHypotheses(claims: { id: string; statement: string }[], hypotheses: PositioningHypothesis[]): PositioningHypothesis[] {
  return claims.some(claim => claim.id === 'category-frame') ? hypotheses : []
}