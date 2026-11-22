import { emptyUsage, type SourceRecord } from '../contracts'
import type { OfficialTransport, ProviderAdapter, ProviderContext, ProviderEstimate, ProviderOutcome } from './types'
import { blockedSource, toSourceRecord } from './normalize'

export interface OfficialInput {
  url: string
  issuer: string
  sector?: string | null
  period?: string | null
  geography?: string | null
  authorityScore?: number
}

const VERSION = 'egypt-official-1'
const estimate: ProviderEstimate = { calls: 1, pages: 1, tokens: 0, credits: 1 }

/** Ticket 05: Egypt official sources with issuer, period and geography captured. */
export function createEgyptOfficialProvider(transport: OfficialTransport, options: { version?: string } = {}): ProviderAdapter<OfficialInput> {
  const version = options.version ?? VERSION
  return {
    name: 'egypt_official',
    version,
    needsKey: false,
    estimate: () => ({ ...estimate }),
    async execute(input: OfficialInput, context: ProviderContext): Promise<ProviderOutcome> {
      const usage = { ...emptyUsage(), calls: 1, pages: 1, credits: 1 }
      const result = await transport.fetchPage(input.url, { signal: context.signal })
      if (!result.ok) {
        const source = blockedSource({
          id: `eg:${context.callId}`,
          url: input.url,
          provider: 'egypt_official',
          toolAction: 'fetch_page',
          toolkitVersion: version,
          reason: result.message,
          usage,
          sector: input.sector ?? null,
          geography: input.geography ?? 'Egypt',
        })
        return { ok: false, code: result.code, message: result.message, sources: [source], candidates: [], usage, notes: [result.message] }
      }
      const source: SourceRecord = toSourceRecord({
        id: `eg:${context.callId}`,
        url: input.url,
        title: result.title || input.issuer,
        provider: 'egypt_official',
        toolAction: 'fetch_page',
        toolkitVersion: version,
        excerpt: result.markdown,
        availability: 'retrieved',
        usage,
        publishedAt: result.publishedAt,
        sector: input.sector ?? null,
        geography: result.geography ?? input.geography ?? 'Egypt',
        period: result.period ?? input.period ?? null,
        authority: result.issuer || input.issuer,
        authorityScore: input.authorityScore ?? 0.95,
        sourceType: 'official',
      })
      return { ok: true, sources: [source], candidates: [], usage, notes: [`Official source ${result.issuer || input.issuer}; capture the reference period with the claim.`] }
    },
  }
}