import { emptyUsage, type ProviderName, type SourceRecord } from '../contracts'
import type { ProviderAdapter, ProviderContext, ProviderEstimate, ProviderOutcome, ScrapeTransport } from './types'
import { blockedSource, excerptOf, toSourceRecord } from './normalize'

export interface FirecrawlInput {
  url: string
  sector?: string | null
  geography?: string | null
}

const VERSION = 'firecrawl-1'
const estimate: ProviderEstimate = { calls: 1, pages: 1, tokens: 0, credits: 1 }

/**
 * Ticket 03: open a known URL server-side and persist an inspectable source.
 * A blocked or unreachable page becomes availability='blocked' with a reason.
 */
export function createFirecrawlProvider(transport: ScrapeTransport, options: { version?: string } = {}): ProviderAdapter<FirecrawlInput> {
  const version = options.version ?? VERSION
  return {
    name: 'firecrawl' satisfies ProviderName,
    version,
    needsKey: true,
    estimate: () => ({ ...estimate }),
    async execute(input: FirecrawlInput, context: ProviderContext): Promise<ProviderOutcome> {
      const usage = { ...emptyUsage(), calls: 1, pages: 1, credits: 1 }
      if (!input.url || !/^https?:\/\//i.test(input.url)) {
        return {
          ok: false,
          code: 'unavailable',
          message: 'A full http(s) URL is required to extract a page.',
          sources: [],
          candidates: [],
          usage,
          notes: ['No page was opened: the URL is not a full http(s) address.'],
        }
      }
      const result = await transport.scrape(input.url, { signal: context.signal })
      if (!result.ok) {
        const source = blockedSource({
          id: `fc:${context.callId}`,
          url: input.url,
          provider: 'firecrawl',
          toolAction: 'scrape',
          toolkitVersion: version,
          reason: result.message,
          availability: result.code === 'blocked' ? 'blocked' : 'unavailable',
          usage,
          sector: input.sector ?? null,
          geography: input.geography ?? null,
        })
        return {
          ok: false,
          code: result.code,
          message: result.message,
          sources: [source],
          candidates: [],
          usage,
          notes: [result.message],
        }
      }
      const excerpt = excerptOf(result.markdown)
      const source: SourceRecord = toSourceRecord({
        id: `fc:${context.callId}`,
        url: input.url,
        title: result.title || input.url,
        provider: 'firecrawl',
        toolAction: 'scrape',
        toolkitVersion: version,
        excerpt,
        availability: excerpt ? 'retrieved' : 'partial',
        usage,
        publishedAt: result.publishedAt,
        sector: input.sector ?? null,
        geography: input.geography ?? null,
        authority: null,
        authorityScore: 0.5,
        sourceType: 'website',
        blockedReason: excerpt ? null : 'The page returned no readable content.',
      })
      return { ok: true, sources: [source], candidates: [], usage, notes: excerpt ? [] : ['The page opened but had no readable text.'] }
    },
  }
}