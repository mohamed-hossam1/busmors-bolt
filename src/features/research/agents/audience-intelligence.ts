import { capsForRun, isComposioActionAllowed } from '../policy'
import type { ResearchBrief, SourceRecord } from '../contracts'
import type { Subagent, WorkerContext, WorkerResult } from '../director/director'
import { agentForTrack } from '../director/brief'
import { coverageNotes, gather, makeClaim, observation, result } from './common'
import { extractSocialItems, type ComposioPlatform } from '../providers/composio'
import type { EvidenceObservation } from '../contracts'
import { routeForSector } from '../references/source-registry'
import { themeOfPublicText } from './themes'

export interface SampleFrame {
  platforms: string[]
  geography: string[]
  window: { from: string; to: string }
  collected: number
  missing: string[]
}

export interface AudienceSegment {
  name: string
  job: string
  trigger: string
  workaround: string
  urgency: 'low' | 'medium' | 'high'
  priceSensitivity: 'low' | 'medium' | 'high'
  barriers: string[]
  channels: string[]
  trust: string[]
}

export interface VoiceOfCustomer {
  quote: string
  quoteLanguage: 'ar-EG' | 'en'
  translation: string | null
  sourceUrl: string
  platform: string
  geography: string | null
  theme: string
}

/** Who is missing from a social sample is part of the sample frame. */
function missingGroups(frame: SampleFrame): string[] {
  const missing: string[] = []
  if (!frame.geography.length) missing.push('Geography is undeclared; no location coverage is claimed.')
  if (frame.collected < 10) missing.push('Fewer than 10 public posts: the sample cannot support a segment, only hypotheses.')
  missing.push('Social samples over-represent people who post publicly; non-posters and offline buyers are missing.')
  missing.push('No primary research was run: this is optional and never automatic.')
  return missing
}

/** Functional segments from observed jobs, not invented demographics. */
function buildSegments(voc: VoiceOfCustomer[]): AudienceSegment[] {
  const segments = new Map<string, AudienceSegment>()
  for (const item of voc) {
    const current = segments.get(item.theme) ?? {
      name: `${item.theme} researchers`,
      job: `Resolve ${item.theme} concerns before choosing a provider`,
      trigger: item.quote,
      workaround: 'Compares public posts and asks in community groups',
      urgency: 'medium' as const,
      priceSensitivity: item.theme === 'price' ? 'high' as const : 'medium' as const,
      barriers: [] as string[],
      channels: [item.platform] as string[],
      trust: [] as string[],
    }
    if (!current.barriers.includes(item.theme)) current.barriers.push(item.theme)
    if (!current.channels.includes(item.platform)) current.channels.push(item.platform)
    segments.set(item.theme, current)
  }
  return [...segments.values()]
}

/**
 * Ticket 11: Customer & Audience Intelligence.
 * Voice of Customer from a bounded public sample (Composio allowlist), with the
 * original quote preserved and any translation stored separately.
 */
export function createAudienceIntelligence(options: { platforms?: ComposioPlatform[] } = {}): Subagent {
  return {
    name: agentForTrack('customer_audience'),
    track: 'customer_audience',
    role: 'subagent',
    skill: 'egypt-customer-audience',
    async run(context: WorkerContext, budget): Promise<WorkerResult> {
      const brief: ResearchBrief = context.brief
      const sector = routeForSector(brief.businessProfile.sector).sector
      const geography = brief.geography.governorates.join(', ') || 'Egypt'
      const usage = { calls: 0, pages: 0, tokens: 0, credits: 0 }
      const sources = new Map<string, SourceRecord>()
      const observations: WorkerResult['observations'] = []
      const voc: VoiceOfCustomer[] = []
      const gaps: string[] = []
      const caps = capsForRun()
      const platforms = options.platforms ?? ['facebook', 'instagram', 'tiktok']
      let sampled = 0

      const gathered = await gather(context, {
        family: 'semantic',
        queries: [
          `${brief.category.label} \u0634\u0643\u0627\u0648\u064a \u0623\u0648 \u062a\u062c\u0631\u0628\u0629`,
          `${brief.category.label} reviews complaints`,
          `${brief.category.label} \u0628\u0643\u0627\u0645 \u0648\u0644\u0627 \u063a\u0627\u0644\u064a`,
        ],
        sector,
        geography,
        maxOpen: Math.max(1, Math.min(2, Math.floor(budget.pages * 0.3))),
        minResults: 3,
      })
      usage.calls += gathered.usage.calls
      usage.pages += gathered.usage.pages
      usage.tokens += gathered.usage.tokens
      usage.credits += gathered.usage.credits
      for (const source of gathered.sources) sources.set(source.id, source)
      for (const note of coverageNotes(gathered.notes)) if (!gaps.includes(note)) gaps.push(note)

      for (const platform of platforms) {
        if (sampled >= caps.posts || context.ledger.exhausted) break
        for (const action of ['posts_list']) {
          if (!isComposioActionAllowed(platform, action)) continue
          if (sampled >= caps.posts) break
          try {
            const social = await context.router.social({
              platform,
              action,
              mode: 'instant',
              query: `${brief.category.label} ${brief.businessProfile.audience}`,
              params: { query: brief.category.label },
              signal: context.signal,
            })
            usage.calls += social.usage.calls
            usage.credits += social.usage.credits
            usage.tokens += social.usage.tokens
            for (const source of social.outcome.sources) sources.set(source.id, source)
            const items = extractSocialItems({ data: social.outcome.sources.map(source => ({ url: source.url, text: source.excerpt, author: source.authority, id: source.id })) }, { platform, action, mode: 'instant', query: '' }, caps)
            for (const item of items) {
              if (sampled >= caps.posts) break
              sampled += 1
              const quote = item.text.trim()
              if (!quote) continue
              const source = social.outcome.sources.find(candidate => candidate.url === item.url)
              if (source) observations.push(observation(source, quote.slice(0, 500), 'quote'))
              voc.push({ quote: quote.slice(0, 500), quoteLanguage: /[\u0600-\u06FF]/.test(quote) ? 'ar-EG' : 'en', translation: null, sourceUrl: item.url, platform, geography: brief.geography.governorates[0] ?? null, theme: themeOfPublicText(quote) })
            }
            await context.emit({
              instanceId: crypto.randomUUID(),
              correlationId: crypto.randomUUID(),
              parentInstanceId: null,
              type: 'skill_read',
              agentId: 'composio',
              agentRole: 'tool',
              label: 'Public social sample',
              status: 'completed',
              publicMessage: `Bounded public sample: ${items.length} item(s) from ${platform}/${action}.`,
              parametersRedacted: { platform, action, cap: caps.posts },
              sourceIds: social.outcome.sources.map(source => source.id),
              consumption: social.usage,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              failureReason: null,
            })
          } catch (error) {
            gaps.push(`${platform}/${action} refused or failed: ${error instanceof Error ? error.message : 'unknown error'}`)
            break
          }
        }
      }

      const frame: SampleFrame = {
        platforms,
        geography: brief.geography.governorates,
        window: { from: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(), to: new Date().toISOString() },
        collected: sampled,
        missing: [],
      }
      frame.missing = missingGroups(frame)
      const segments = buildSegments(voc)
      const claims = [
        ...(sampled > 0 ? [makeClaim({
          id: 'voc-themes',
          statement: sampled
            ? `${sampled} public post/comment quote(s) were captured; the dominant themes are ${[...new Set(voc.map(item => item.theme))].join(', ')}.`
            : 'No public quote was captured; audience findings are hypotheses only.',
          kind: 'voice_of_customer',
          evidence: observations.filter(item => item.kind === 'quote'),
          sources: [...sources.values()],
          geography: brief.geography.label,
          conflicts: [],
        })] : []),
        makeClaim({
          id: 'sample-frame',
          statement: `Sample frame: ${frame.platforms.join(', ')} in ${frame.geography.join(', ') || 'undeclared geography'}; ${frame.collected} item(s). Missing: ${frame.missing.length} known gap(s).`,
          kind: 'method',
          evidence: [],
          sources: [...sources.values()],
          geography: brief.geography.label,
        }),
      ]

      if (sampled === 0) gaps.push('No social sample: findings are hypotheses and primary research was not run.')
      if (frame.missing.length) gaps.push(...frame.missing.filter(item => item.startsWith('Fewer than') || item.startsWith('Geography')))

      return result({
        track: 'customer_audience',
        summary: `${sampled} quote(s), ${segments.length} functional segment(s), sample frame with ${frame.missing.length} declared gap(s).`,
        sources: [...sources.values()],
        observations,
        usage,
        coverageGaps: gaps,
        claims,
      })
    },
  }
}

/** The bias card travels with the audience artifacts. */
export function biasCard(frame: SampleFrame): string[] {
  return [
    `Platform coverage: ${frame.platforms.join(', ')}.`,
    `Geography: ${frame.geography.join(', ') || 'undeclared'}.`,
    `Window: ${frame.window.from} → ${frame.window.to}.`,
    ...frame.missing,
  ]
}

export type { EvidenceObservation }