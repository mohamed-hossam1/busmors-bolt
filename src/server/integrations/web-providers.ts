import 'server-only'

/**
 * Raw provider HTTP transports.
 *
 * Infrastructure only: no research planning, evidence normalization, provider
 * routing, health checks, or model-facing exposure. These functions are
 * server-only and must not be imported by client components or public routes.
 */

export type ProviderErrorCode =
  | 'not_configured'
  | 'invalid_key'
  | 'insufficient_allowance'
  | 'rate_limited'
  | 'unavailable'
  | 'blocked'
  | 'payment_required'
  | 'network_error'
  | 'provider_error'

export interface SearchHit {
  url: string
  title: string
  snippet: string
  score?: number
  publishedAt?: string | null
}

type Failure = { ok: false; code: ProviderErrorCode; message: string }

const TIMEOUT_MS = 25000

function key(name: string): string | null {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : null
}

async function postJson(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal, timeoutMs = TIMEOUT_MS): Promise<{ status: number; data: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

function failureFromStatus(status: number, provider: string): Failure {
  if (status === 401 || status === 403) return { ok: false, code: 'invalid_key', message: `${provider} rejected the credential (HTTP ${status}).` }
  if (status === 402) return { ok: false, code: 'insufficient_allowance', message: `${provider} reported no remaining balance (HTTP 402).` }
  if (status === 429) return { ok: false, code: 'rate_limited', message: `${provider} rate limit reached (HTTP 429).` }
  if (status >= 500) return { ok: false, code: 'unavailable', message: `${provider} is unavailable (HTTP ${status}).` }
  return { ok: false, code: 'provider_error', message: `${provider} returned HTTP ${status}.` }
}

/** Firecrawl: server-side page extraction. The key never leaves this module. */
export async function firecrawlScrape(url: string, options: { signal: AbortSignal; timeoutMs?: number }): Promise<
  | { ok: true; title: string; markdown: string; publishedAt: string | null }
  | Failure
> {
  const apiKey = key('FIRECRAWL_API_KEY')
  if (!apiKey) return { ok: false, code: 'not_configured', message: 'FIRECRAWL_API_KEY is not configured on the server.' }
  const timeout = Math.min(TIMEOUT_MS, Math.max(1000, options.timeoutMs ?? TIMEOUT_MS))
  try {
    const { status, data } = await postJson('https://api.firecrawl.dev/v2/scrape', { url, formats: ['markdown'], onlyMainContent: true, proxy: 'auto', timeout }, { Authorization: `Bearer ${apiKey}` }, options.signal, timeout)
    if (status >= 400) return failureFromStatus(status, 'Firecrawl')
    const payload = data as { success?: boolean; data?: { markdown?: string; metadata?: { title?: string | string[]; publishedTime?: string } }; error?: string }
    if (!payload.success || !payload.data?.markdown) return { ok: false, code: 'blocked', message: payload.error ?? 'Firecrawl returned no readable markdown for this page.' }
    const rawTitle = payload.data.metadata?.title
    return {
      ok: true,
      title: Array.isArray(rawTitle) ? rawTitle[0] ?? '' : rawTitle ?? '',
      markdown: payload.data.markdown,
      publishedAt: payload.data.metadata?.publishedTime ?? null,
    }
  } catch (error) {
    return { ok: false, code: 'network_error', message: `Firecrawl request failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
}

/** Tavily Basic Search: ranked candidates, never evidence. */
export async function tavilySearch(query: string, options: { maxResults: number; signal: AbortSignal }): Promise<
  | { ok: true; hits: SearchHit[] }
  | Failure
> {
  const apiKey = key('TAVILY_API_KEY')
  if (!apiKey) return { ok: false, code: 'not_configured', message: 'TAVILY_API_KEY is not configured on the server.' }
  try {
    const { status, data } = await postJson('https://api.tavily.com/search', { query, max_results: options.maxResults, search_depth: 'basic', include_answer: false }, { Authorization: `Bearer ${apiKey}` }, options.signal)
    if (status >= 400) return failureFromStatus(status, 'Tavily')
    const payload = data as { results?: { url: string; title?: string; content?: string; score?: number }[] }
    const hits = (payload.results ?? []).map(result => ({ url: result.url, title: result.title ?? '', snippet: result.content ?? '', score: result.score }))
    if (!hits.length) return { ok: false, code: 'unavailable', message: 'Tavily returned no results for this query.' }
    return { ok: true, hits }
  } catch (error) {
    return { ok: false, code: 'network_error', message: `Tavily request failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
}

/** Exa: semantic discovery for long-tail competitors and entities. */
export async function exaSearch(query: string, options: { maxResults: number; signal: AbortSignal }): Promise<
  | { ok: true; hits: SearchHit[] }
  | Failure
> {
  const apiKey = key('EXA_API_KEY')
  if (!apiKey) return { ok: false, code: 'not_configured', message: 'EXA_API_KEY is not configured on the server.' }
  try {
    const { status, data } = await postJson('https://api.exa.ai/search', { query, numResults: options.maxResults, type: 'auto', contents: { text: { maxCharacters: 1200 } } }, { 'x-api-key': apiKey }, options.signal)
    if (status >= 400) return failureFromStatus(status, 'Exa')
    const payload = data as { results?: { url: string; title?: string; text?: string; publishedDate?: string }[] }
    const hits = (payload.results ?? []).map(result => ({ url: result.url, title: result.title ?? '', snippet: result.text ?? '', publishedAt: result.publishedDate ?? null }))
    if (!hits.length) return { ok: false, code: 'unavailable', message: 'Exa returned no semantic matches.' }
    return { ok: true, hits }
  } catch (error) {
    return { ok: false, code: 'network_error', message: `Exa request failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
}

/** Composio SCRAPECREATORS: allowlisted read actions only, key server-side. */
export async function composioRun(action: string, options: { signal: AbortSignal; params: Record<string, unknown> }): Promise<
  | { ok: true; data: Record<string, unknown>; chargedCredits?: number }
  | Failure & { paymentRequired?: boolean }
> {
  const apiKey = key('COMPOSIO_API_KEY')
  if (!apiKey) return { ok: false, code: 'not_configured', message: 'COMPOSIO_API_KEY is not configured on the server.' }
  try {
    const { status, data } = await postJson(`https://backend.composio.dev/api/v1/tools/execute/${encodeURIComponent(action)}`, { arguments: options.params }, { 'x-api-key': apiKey }, options.signal)
    if (status >= 400) {
      const payload = data as { message?: string; payment_required?: boolean }
      if (status === 402 || payload.payment_required) return { ok: false, code: 'payment_required', message: 'Composio would charge for this action; execution refused.', paymentRequired: true }
      return failureFromStatus(status, 'Composio')
    }
    const payload = data as { data?: Record<string, unknown>; successful?: boolean; error?: string; chargedCredits?: number }
    if (payload.successful === false) return { ok: false, code: 'unavailable', message: payload.error ?? 'Composio action failed.' }
    return { ok: true, data: payload.data ?? (data as Record<string, unknown>), chargedCredits: payload.chargedCredits }
  } catch (error) {
    return { ok: false, code: 'network_error', message: `Composio request failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
}

/** Instant-action pricing, when the deployment exposes a pricing endpoint. */
export async function composioInstantPrice(action: string): Promise<{ ok: true; credits: number; paymentRequired: boolean } | { ok: false; message: string }> {
  const endpoint = key('COMPOSIO_PRICING_URL')
  if (!endpoint) return { ok: false, message: 'No instant pricing endpoint configured; the worst-case estimate is reserved instead.' }
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(action)}`, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return { ok: false, message: `Instant pricing returned HTTP ${response.status}.` }
    const payload = await response.json() as { credits?: number; paymentRequired?: boolean }
    if (typeof payload.credits !== 'number' || !Number.isFinite(payload.credits)) return { ok: false, message: 'Instant pricing returned no credit amount.' }
    return { ok: true, credits: payload.credits, paymentRequired: payload.paymentRequired ?? false }
  } catch (error) {
    return { ok: false, message: `Instant pricing failed: ${error instanceof Error ? error.message : 'unknown error'}` }
  }
}