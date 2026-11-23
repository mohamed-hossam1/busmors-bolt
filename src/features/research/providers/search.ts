import { emptyUsage } from '../contracts'
import type { ProviderAdapter, ProviderContext, ProviderEstimate, ProviderOutcome, SearchTransport } from './types'
import { dedupeCandidates, type CandidateUrl } from './normalize'

export interface SearchInput {
  query: string
  maxResults?: number
  sector?: string | null
  geography?: string | null
}

const VERSION = 'tavily-basic-1'
const estimate: ProviderEstimate = { calls: 1, pages: 0, tokens: 600, credits: 1 }

/** Ticket 04: ranked candidate URLs. A hit is a candidate, never evidence. */
export function createTavilyProvider(transport: SearchTransport, options: { version?: string } = {}): ProviderAdapter<SearchInput> {
  const version = options.version ?? VERSION
  return {
    name: 'tavily',
    version,
    needsKey: true,
    estimate: () => ({ ...estimate }),
    async execute(input: SearchInput, context: ProviderContext): Promise<ProviderOutcome> {
      const usage = { ...emptyUsage(), calls: 1, tokens: 600, credits: 1 }
      const maxResults = Math.max(1, Math.min(20, input.maxResults ?? 8))
      const result = await transport.search(input.query, { maxResults, signal: context.signal })
      if (!result.ok) {
        return { ok: false, code: result.code, message: result.message, sources: [], candidates: [], usage, notes: [result.message] }
      }
      const candidates: CandidateUrl[] = dedupeCandidates(result.hits
        .filter(hit => /^https?:\/\//i.test(hit.url))
        .map(hit => ({ url: hit.url, title: hit.title.slice(0, 300), snippet: hit.snippet.slice(0, 500), provider: 'tavily' as const, score: hit.score })))
      const notes = [`${candidates.length} candidate pages from Tavily Basic Search; open the chosen page with Firecrawl before citing it.`]
      if (candidates.length === 0) {
        return { ok: false, code: 'unavailable', message: 'No candidate pages were returned for this query.', sources: [], candidates: [], usage, notes }
      }
      return { ok: true, sources: [], candidates, usage, notes }
    },
  }
}

const EXA_VERSION = 'exa-neural-1'
const EXA_ESTIMATE: ProviderEstimate = { calls: 1, pages: 0, tokens: 500, credits: 1 }

/** Ticket 05: semantic discovery for long-tail competitors, entities and news. */
export function createExaProvider(transport: SearchTransport, options: { version?: string } = {}): ProviderAdapter<SearchInput> {
  const version = options.version ?? EXA_VERSION
  return {
    name: 'exa',
    version,
    needsKey: true,
    estimate: () => ({ ...EXA_ESTIMATE }),
    async execute(input: SearchInput, context: ProviderContext): Promise<ProviderOutcome> {
      const usage = { ...emptyUsage(), calls: 1, tokens: 500, credits: 1 }
      const result = await transport.search(input.query, { maxResults: Math.max(1, Math.min(20, input.maxResults ?? 8)), signal: context.signal })
      if (!result.ok) {
        return { ok: false, code: result.code, message: result.message, sources: [], candidates: [], usage, notes: [result.message] }
      }
      const candidates = dedupeCandidates(result.hits.map(hit => ({ url: hit.url, title: hit.title.slice(0, 300), snippet: hit.snippet.slice(0, 500), provider: 'exa' as const, score: hit.score })))
      const notes = [`${candidates.length} semantic candidates. Discovery only: promote a page to a source by opening it.`]
      if (candidates.length === 0) {
        return { ok: false, code: 'unavailable', message: 'Exa returned no semantic matches.', sources: [], candidates: [], usage, notes }
      }
      return { ok: true, sources: [], candidates, usage, notes }
    },
  }
}