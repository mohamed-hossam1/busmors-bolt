import 'server-only'
import { cleanPageForAi } from '../../lib/crawlContent'

/**
 * Web discovery/reading adapters for the Director (spec 3.5).
 *
 * These wrap the existing external providers (Tavily, Exa, Firecrawl) and
 * return CLEAN EXCERPTS with URLs — never raw HTML dumps. Every provider is
 * optional: when its key is missing from the environment the adapter reports
 * unavailability honestly instead of pretending to have searched. Content is
 * treated as untrusted data by the caller (the model prompt says so); this
 * module only fetches and trims.
 */

export type WebProviderName = 'tavily' | 'exa' | 'firecrawl'

export interface WebExcerpt {
  title: string
  url: string
  excerpt: string
}

export type WebSearchResult =
  | { status: 'ok'; provider: WebProviderName; results: WebExcerpt[] }
  | { status: 'unavailable'; provider: WebProviderName; message: string }
  | { status: 'error'; provider: WebProviderName; message: string }

export type WebScrapeResult =
  | { status: 'ok'; provider: 'firecrawl'; url: string; title: string; excerpt: string }
  | { status: 'unavailable'; provider: 'firecrawl'; message: string }
  | { status: 'error'; provider: 'firecrawl'; message: string }

const EXCERPT_MAX_CHARS = 1200
const SEARCH_TIMEOUT_MS = 15_000
const SCRAPE_TIMEOUT_MS = 20_000

function apiKey(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

function trimExcerpt(text: string, max = EXCERPT_MAX_CHARS): string {
  const cleaned = cleanPageForAi(text).replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  return `${cleaned.slice(0, max).trimEnd()}…`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface TavilyResponse {
  answer?: string
  results?: Array<{ title?: string; url?: string; content?: string }>
}

async function tavilySearch(query: string, maxResults: number): Promise<WebSearchResult> {
  const key = apiKey('TAVILY_API_KEY')
  if (!key) {
    return { status: 'unavailable', provider: 'tavily', message: 'Tavily search is not configured (missing TAVILY_API_KEY).' }
  }
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query,
        max_results: Math.max(1, Math.min(10, maxResults)),
        search_depth: 'basic',
        include_answer: true,
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { status: 'error', provider: 'tavily', message: `Tavily returned HTTP ${response.status}.` }
    }
    const payload = (await response.json().catch(() => ({}))) as TavilyResponse
    const results: WebExcerpt[] = []
    if (payload.answer) {
      results.push({ title: 'Answer', url: '', excerpt: trimExcerpt(payload.answer) })
    }
    for (const item of payload.results ?? []) {
      if (!item.url || !item.content) continue
      results.push({
        title: item.title?.trim() || item.url,
        url: item.url,
        excerpt: trimExcerpt(item.content),
      })
    }
    return { status: 'ok', provider: 'tavily', results }
  } catch (error) {
    return { status: 'error', provider: 'tavily', message: errorMessage(error) }
  }
}

interface ExaResponse {
  results?: Array<{ title?: string; url?: string; text?: string }>
}

async function exaSearch(query: string, maxResults: number): Promise<WebSearchResult> {
  const key = apiKey('EXA_API_KEY')
  if (!key) {
    return { status: 'unavailable', provider: 'exa', message: 'Exa search is not configured (missing EXA_API_KEY).' }
  }
  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        query,
        numResults: Math.max(1, Math.min(10, maxResults)),
        contents: { text: { maxCharacters: EXCERPT_MAX_CHARS } },
      }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { status: 'error', provider: 'exa', message: `Exa returned HTTP ${response.status}.` }
    }
    const payload = (await response.json().catch(() => ({}))) as ExaResponse
    const results: WebExcerpt[] = []
    for (const item of payload.results ?? []) {
      if (!item.url) continue
      results.push({
        title: item.title?.trim() || item.url,
        url: item.url,
        excerpt: trimExcerpt(item.text ?? ''),
      })
    }
    return { status: 'ok', provider: 'exa', results }
  } catch (error) {
    return { status: 'error', provider: 'exa', message: errorMessage(error) }
  }
}

export async function webSearch(
  provider: 'tavily' | 'exa',
  query: string,
  maxResults = 5,
): Promise<WebSearchResult> {
  return provider === 'tavily' ? tavilySearch(query, maxResults) : exaSearch(query, maxResults)
}

interface FirecrawlResponse {
  success?: boolean
  data?: { markdown?: string; metadata?: { title?: string | string[] } }
}

export async function firecrawlScrape(url: string): Promise<WebScrapeResult> {
  const key = apiKey('FIRECRAWL_API_KEY')
  if (!key) {
    return { status: 'unavailable', provider: 'firecrawl', message: 'Firecrawl is not configured (missing FIRECRAWL_API_KEY).' }
  }
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, proxy: 'auto', timeout: SCRAPE_TIMEOUT_MS }),
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { status: 'error', provider: 'firecrawl', message: `Firecrawl returned HTTP ${response.status}.` }
    }
    const payload = (await response.json().catch(() => ({}))) as FirecrawlResponse
    if (!payload.success || !payload.data?.markdown) {
      return { status: 'error', provider: 'firecrawl', message: 'Firecrawl could not read the page.' }
    }
    const rawTitle = payload.data.metadata?.title
    const title = (Array.isArray(rawTitle) ? rawTitle[0] : rawTitle)?.trim() || url
    return { status: 'ok', provider: 'firecrawl', url, title, excerpt: trimExcerpt(payload.data.markdown) }
  } catch (error) {
    return { status: 'error', provider: 'firecrawl', message: errorMessage(error) }
  }
}