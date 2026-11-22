import { emptyUsage } from '../contracts'
import { COMPOSIO_ALLOWED_ACTIONS, assertComposioAction, capsForRun, isComposioActionAllowed, PolicyViolation, type RunCaps } from '../policy'
import type { ComposioTransport, ProviderAdapter, ProviderContext, ProviderOutcome } from './types'
import { canonicalizeUrl, toSourceRecord } from './normalize'

export type ComposioPlatform = 'facebook' | 'instagram' | 'tiktok' | 'youtube' | 'reddit'
export type ComposioMode = 'instant' | 'connected'

export interface ComposioInput {
  platform: ComposioPlatform
  action: string
  mode: ComposioMode
  query: string
  params?: Record<string, unknown>
  caps?: RunCaps
}

/** Worst-case instant price per action class, reserved before execution. */
export const INSTANT_WORST_CASE: Readonly<Record<string, number>> = Object.freeze({
  profiles_get: 1,
  posts_list: 2,
  comments_list: 4,
  transcripts_get: 4,
  ad_library_search: 3,
  channels_get: 1,
  videos_list: 2,
})

export const COMPOSIO_TOOLKIT_VERSION = 'composio-scrapaceators-read-1'

export function estimateCredits(action: string): number {
  return INSTANT_WORST_CASE[action] ?? 3
}

export interface SocialItem {
  id: string
  url: string
  text: string
  author: string
  platform: ComposioPlatform
  publishedAt: string | null
  kind: string
}

function pickArray(data: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ['data', 'items', 'posts', 'comments', 'results', 'videos', 'profiles', 'transcripts']) {
    const value = data[key]
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    if (value && typeof value === 'object') {
      const nested = pickArray(value as Record<string, unknown>)
      if (nested.length) return nested
    }
  }
  return []
}

/** Normalise a social payload into capped, inspectable observations. */
export function extractSocialItems(data: Record<string, unknown>, input: ComposioInput, caps: RunCaps = capsForRun()): SocialItem[] {
  const items: SocialItem[] = []
  for (const raw of pickArray(data)) {
    if (items.length >= Math.min(caps.posts, caps.profiles, caps.videos)) break
    const id = String(raw.id ?? raw.post_id ?? raw.video_id ?? raw.username ?? raw.profile_id ?? items.length)
    const url = String(raw.url ?? raw.permalink ?? raw.link ?? raw.profile_url ?? '')
    if (!/^https?:\/\//i.test(url)) continue
    const text = String(raw.text ?? raw.caption ?? raw.title ?? raw.transcript ?? raw.description ?? raw.comment ?? '').slice(0, 2000)
    const author = String(raw.author ?? raw.username ?? raw.owner ?? raw.channel ?? '').slice(0, 200)
    items.push({
      id,
      url,
      text,
      author,
      platform: input.platform,
      publishedAt: typeof raw.published_at === 'string' ? raw.published_at : typeof raw.created_at === 'string' ? raw.created_at : null,
      kind: input.action.replace(/_/g, ' '),
    })
  }
  return items
}

/**
 * Ticket 06: Composio SCRAPECREATORS read adapter.
 * Only allowlisted read actions are callable; PII/enrichment actions throw a
 * PolicyViolation, so no agent can reach them through this adapter.
 */
export function createComposioProvider(transport: ComposioTransport, options: { version?: string } = {}): ProviderAdapter<ComposioInput> {
  const version = options.version ?? COMPOSIO_TOOLKIT_VERSION
  return {
    name: 'composio',
    version,
    needsKey: true,
    estimate: input => {
      if (!isComposioActionAllowed(input.platform, input.action)) {
        throw new PolicyViolation('composioAllowlistOnly', `${input.platform}/${input.action} is blocked.`)
      }
      return { calls: 1, pages: 0, tokens: 0, credits: estimateCredits(input.action) }
    },
    async execute(input: ComposioInput, context: ProviderContext): Promise<ProviderOutcome> {
      const caps = input.caps ?? capsForRun()
      const usage = { ...emptyUsage(), calls: 1 }
      assertComposioAction(input.platform, input.action)
      if (input.mode === 'instant' && transport.instantPrice) {
        const price = await transport.instantPrice(input.action)
        if (!price.ok) return { ok: false, code: 'unavailable', message: price.message, sources: [], candidates: [], usage, notes: [price.message] }
        if (price.paymentRequired) {
          return {
            ok: false,
            code: 'payment_required',
            message: 'This instant action would require payment. Execution is refused; no credits were spent.',
            sources: [],
            candidates: [],
            usage,
            notes: ['Instant action refused before execution because it would require payment.'],
          }
        }
      }
      const result = await transport.run(input.action, { signal: context.signal, params: input.params ?? {} })
      if (!result.ok) {
        const code = result.paymentRequired ? 'payment_required' : result.code
        return { ok: false, code, message: result.message, sources: [], candidates: [], usage, notes: [result.message] }
      }
      const charged = Number.isFinite(result.chargedCredits) ? Number(result.chargedCredits) : estimateCredits(input.action)
      usage.credits = charged
      const items = extractSocialItems(result.data, input, caps)
      const sources = items.map((item, index) => toSourceRecord({
        id: `sc:${context.callId}:${index}`,
        url: item.url,
        title: `${item.author || input.platform} — ${item.kind}`.slice(0, 300),
        provider: 'composio',
        toolAction: `${input.platform}/${input.action}`,
        toolkitVersion: version,
        excerpt: item.text,
        availability: 'retrieved',
        storagePolicy: 'excerpt',
        usage: { calls: 0, pages: 0, tokens: 0, credits: index === 0 ? charged : 0 },
        credits: index === 0 ? charged : 0,
        publishedAt: item.publishedAt,
        geography: 'Egypt',
        authority: item.author || input.platform,
        authorityScore: 0.45,
        sourceType: 'social',
      }))
      const notes = [
        `${items.length} social observation(s) via ${input.platform}/${input.action} (${input.mode}); credits ${charged} of ${estimateCredits(input.action)} reserved.`,
        'Public sample only: platform, geography and date coverage must be declared with any finding.',
      ]
      if (sources.length === 0) {
        return { ok: false, code: 'unavailable', message: 'The social action returned no readable items.', sources, candidates: [], usage, notes }
      }
      return { ok: true, sources, candidates: [], usage, notes }
    },
  }
}

/** The adapter refuses blocked actions before any transport call. */
export function assertComposioReadonly(platform: string, action: string): void {
  assertComposioAction(platform, action)
}

/** The only actions an agent can ever see for a platform. */
export function composioAllowedActions(platform: string): readonly string[] {
  return COMPOSIO_ALLOWED_ACTIONS[platform] ?? []
}

/** A social observation keeps its canonical URL so reports can link to it. */
export function canonicalSocialUrl(url: string): string {
  return canonicalizeUrl(url)
}