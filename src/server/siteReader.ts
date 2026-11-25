import 'server-only'
import { cleanPageForAi, type CrawledPage } from '../lib/crawlContent'
import { DEFAULT_CRAWL_PAGES } from '../lib/crawlConstants'

async function firecrawlScrape(
  url: string,
  options: { signal: AbortSignal; timeoutMs?: number },
): Promise<{ ok: true; title: string; markdown: string } | { ok: false }> {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim()
  if (!apiKey) return { ok: false }
  const timeout = Math.min(25000, Math.max(1000, options.timeoutMs ?? 10000))
  try {
    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, proxy: 'auto', timeout }),
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]),
    })
    if (!response.ok) return { ok: false }
    const payload = (await response.json().catch(() => ({}))) as {
      success?: boolean
      data?: { markdown?: string; metadata?: { title?: string | string[] } }
    }
    if (!payload.success || !payload.data?.markdown) return { ok: false }
    const rawTitle = payload.data.metadata?.title
    return {
      ok: true,
      title: Array.isArray(rawTitle) ? (rawTitle[0] ?? '') : (rawTitle ?? ''),
      markdown: payload.data.markdown,
    }
  } catch {
    return { ok: false }
  }
}

export type CrawlProgressCallback = (read: number, total: number, currentUrl?: string) => void
export { DEFAULT_CRAWL_PAGES }
/** Per-page ceiling for the Firecrawl escalation; short enough to keep the crawl fast. */
const FIRECRAWL_PAGE_TIMEOUT = 10000
export interface CrawlOptions {
  signal?: AbortSignal
  timeoutMs?: number
  budgetMs?: number
  concurrency?: number
  forceRefresh?: boolean
  /** Reader transport. Defaults to the standard reader; 'firecrawl' bypasses anti-bot. */
  reader?: 'jina' | 'firecrawl'
}
export interface CrawlDiagnostics {
  attempted: number
  failed: number
  duplicates: number
  cached: number
  elapsed_ms: number
  warnings: string[]
}

const cache = new Map<string, { page: CrawledPage; expires: number }>()
import { normalizeSiteUrl } from '../lib/siteUrl'
export { normalizeSiteUrl } from '../lib/siteUrl'

function sameSite(url: string, base: string): boolean {
  return new URL(url).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, '') && new URL(url).port === new URL(base).port
}

function linkPriority(url: string): number {
  const path = decodeURI(new URL(url).pathname).toLowerCase()
  // High commercial value: products, services, pricing, about, packages, solutions
  if (/(?:about|product|service|solution|pricing|feature|company|package|audience|customer|من[-_]?نحن|عن[-_]?(?:الشركة|الموقع)|خدمات(?:نا)?|منتجات(?:نا)?|باقات|اسعار|أسعار|مميزات|حلول)/i.test(path)) return 10
  // Supporting commercial value: contact, faq, partners
  if (/(?:contact|faq|partner|اتصل[-_]?بنا|تواصل[-_]?معنا|الاسئلة[-_]?الشائعة)/i.test(path)) return 5
  return 0
}

function discoverLinks(page: CrawledPage, base: string): string[] {
  const links = new Set<string>()
  for (const match of page.markdown.matchAll(/(?<!!)\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)) {
    try {
      const url = normalizeSiteUrl(match[1], page.url)
      if (!sameSite(url, base)) continue
      const path = decodeURI(new URL(url).pathname).toLowerCase()
      if (/\.(?:png|jpe?g|gif|webp|avif|svg|pdf|zip|mp4|mp3|css|js|xml)$/i.test(path)) continue
      if (/(?:^|\/)(?:login|signin|signup|sign-in|sign-up|cart|checkout|privacy|terms|legal|cookie|careers?|jobs?|blog|news|author|tag|سلة|تسجيل[-_]?الدخول|سياسة[-_]?الخصوصية|الشروط|الاحكام|وظائف)(?:[-_/]|$)/i.test(path)) continue
      links.add(url)
    } catch { /* Ignore malformed links and non-web protocols. */ }
  }
  const sorted = [...links].sort((a, b) => linkPriority(b) - linkPriority(a))
  // If high-priority commercial links exist, prioritize them to focus strictly on commercial pages
  const highPriority = sorted.filter((u) => linkPriority(u) > 0)
  return highPriority.length > 0 ? highPriority : sorted
}

/**
 * Probes the target website's sitemap.xml to instantly discover high-value canonical pages
 * (e.g. products, pricing, about) without waiting for recursive link discovery.
 */
async function discoverSitemapLinks(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const origin = new URL(baseUrl).origin
    const candidatePaths = ['/sitemap.xml', '/sitemap_index.xml']
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)
    const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

    for (const path of candidatePaths) {
      if (combinedSignal.aborted) break
      try {
        const res = await fetch(`${origin}${path}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BusMoraBot/1.0)' },
          signal: combinedSignal,
          cache: 'no-store',
        })
        if (!res.ok) continue
        const text = await res.text()
        const links = new Set<string>()

        // Check for sub-sitemaps (e.g., sitemap_products, sitemap_pages)
        const subSitemaps: string[] = []
        for (const match of text.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)) {
          const loc = match[1]?.trim()
          if (loc && /product|page|collection|service/i.test(loc)) subSitemaps.push(loc)
        }

        if (subSitemaps.length > 0 && !combinedSignal.aborted) {
          try {
            const subRes = await fetch(subSitemaps[0], {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BusMoraBot/1.0)' },
              signal: combinedSignal,
              cache: 'no-store',
            })
            if (subRes.ok) {
              const subText = await subRes.text()
              for (const m of subText.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
                const url = m[1]?.trim()
                if (url) links.add(url)
              }
            }
          } catch {
            // continue with main sitemap matches
          }
        }

        for (const match of text.matchAll(/<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi)) {
          const url = match[1]?.trim()
          if (url) links.add(url)
        }

        const valid: string[] = []
        for (const raw of links) {
          try {
            const norm = normalizeSiteUrl(raw, origin)
            if (sameSite(norm, origin)) {
              const pathname = decodeURI(new URL(norm).pathname)
              if (/\.(?:png|jpe?g|gif|webp|avif|svg|pdf|zip|mp4|mp3|css|js|xml)$/i.test(pathname)) continue
              if (/(?:^|\/)(?:login|signin|signup|sign-in|sign-up|cart|checkout|privacy|terms|legal|cookie|careers?|jobs?|tag)(?:[-_/]|$)/i.test(pathname)) continue
              valid.push(norm)
            }
          } catch {
            // ignore malformed
          }
        }

        clearTimeout(timer)
        if (valid.length > 0) {
          return valid.sort((a, b) => linkPriority(b) - linkPriority(a))
        }
      } catch {
        // try next candidate path
      }
    }
    clearTimeout(timer)
    return []
  } catch {
    return []
  }
}

function parsePage(raw: string, url: string): CrawledPage | null {
  // The reader's HTTP status does not necessarily describe the target page.
  const marker = raw.indexOf('Markdown Content:')
  const metadata = marker >= 0 ? raw.slice(0, marker) : ''
  if (/Warning:\s*Target URL returned error\s*[45]\d\d/i.test(metadata)) return null
  const markdown = (marker >= 0 ? raw.slice(marker + 'Markdown Content:'.length) : raw).trim()
  const title = metadata.match(/^Title:\s*(.+)$/m)?.[1]?.trim()
  const cleaned = cleanPageForAi(markdown)
  if (cleaned.length < 80 || looksLikeBlockPage(cleaned, title)) return null
  const source = metadata.match(/^URL Source:\s*(https?:\/\/\S+)/m)?.[1]
  let canonical = url
  try {
    if (source) {
      const safeSource = normalizeSiteUrl(source)
      if (!sameSite(safeSource, url)) return null
      canonical = safeSource
    }
  } catch { return null }
  return { url: canonical, markdown, title }
}

/**
 * The reader returns an HTTP error page or a JavaScript/anti-bot challenge as its
 * body. Such pages carry no usable content and must be rejected so the Firecrawl
 * fallback can try to bypass the protection instead.
 */
function looksLikeBlockPage(cleaned: string, title?: string): boolean {
  const head = cleaned.slice(0, 500)
  if (/^(?:404\s*)?(?:#{1,6}\s*)?(?:404\b|page not found\b|not found\b|access denied\b|just a moment\b|checking your browser\b|verify you are human\b|attention required\b|cf-browser-verification\b)/i.test(head)) return true
  return /^(?:404\s*)?(?:page not found|not found|access denied|just a moment|checking your browser)\b/i.test((title || '').trim())
}

function htmlToSimpleMarkdown(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')

  // Convert hyperlinks to markdown [text](href) so discoverLinks works!
  text = text.replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, content) => {
    const cleanContent = content.replace(/<[^>]+>/g, '').trim()
    const cleanHref = href.trim()
    if (!cleanContent || !cleanHref || cleanHref.startsWith('javascript:') || cleanHref.startsWith('#')) {
      return cleanContent || ' '
    }
    return ` [${cleanContent}](${cleanHref}) `
  })

  // Convert headings, paragraphs, and list items to natural line breaks
  text = text
    .replace(/<\/(?:p|div|section|article|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()

  return text
}

function parseFirecrawlPage(markdown: string, title: string, url: string): CrawledPage | null {
  const cleaned = cleanPageForAi(markdown)
  if (cleaned.length < 80 || looksLikeBlockPage(cleaned, title)) return null
  return { url, markdown: markdown.trim(), title: title || undefined }
}

export async function crawlPages(baseUrl: string, requestedMax = DEFAULT_CRAWL_PAGES, onProgress?: CrawlProgressCallback, options: CrawlOptions = {}): Promise<{ pages: CrawledPage[]; diagnostics: CrawlDiagnostics }> {
  const maxPages = Math.max(1, Math.min(5, Math.floor(requestedMax) || DEFAULT_CRAWL_PAGES))
  const concurrency = Math.max(1, Math.min(3, Math.floor(options.concurrency ?? 3) || 3))
  const started = Date.now()
  const diagnostics: CrawlDiagnostics = { attempted: 0, failed: 0, duplicates: 0, cached: 0, elapsed_ms: 0, warnings: [] }
  const queue: string[] = []
  const enqueued = new Set<string>([normalizeSiteUrl(baseUrl)])
  const fingerprints = new Set<string>()
  const pages: CrawledPage[] = []
  const deadline = new AbortController()

  // Notify client immediately so UI shows active state in <50ms
  onProgress?.(0, maxPages, baseUrl)

  const pageTimeout = options.timeoutMs ?? 6000
  const batches = 1 + Math.ceil((maxPages - 1) / concurrency)
  const standardBudget = Math.max(16000, batches * (pageTimeout + FIRECRAWL_PAGE_TIMEOUT) + 1000)
  const budgetMs = options.budgetMs ?? (options.reader === 'firecrawl' ? Math.max(30000, standardBudget + 15000) : standardBudget)
  const budgetTimer = setTimeout(() => deadline.abort(), budgetMs)
  const abort = () => deadline.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) deadline.abort()

  const readViaDirect = async (url: string): Promise<CrawledPage | null> => {
    if (deadline.signal.aborted) return null
    const controller = new AbortController()
    const cancel = () => controller.abort()
    deadline.signal.addEventListener('abort', cancel, { once: true })
    if (deadline.signal.aborted) controller.abort()
    const timer = setTimeout(cancel, 2500)
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 (compatible; BusMoraBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) return null
      const html = await response.text()
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1].trim() : undefined
      const markdown = htmlToSimpleMarkdown(html)
      if (markdown.length < 80 || looksLikeBlockPage(markdown, title)) return null
      return { url, markdown, title }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      deadline.signal.removeEventListener('abort', cancel)
    }
  }

  const readViaJina = async (url: string): Promise<CrawledPage | null> => {
    if (deadline.signal.aborted) return null
    const controller = new AbortController()
    const cancel = () => controller.abort()
    deadline.signal.addEventListener('abort', cancel, { once: true })
    if (deadline.signal.aborted) controller.abort()
    const timer = setTimeout(cancel, pageTimeout)
    try {
      const response = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain', 'X-Robots-Txt': 'BusMoraBot' }, cache: 'no-store', signal: controller.signal })
      if (!response.ok) return null
      return parsePage(await response.text(), url)
    } catch {
      return null
    } finally {
      clearTimeout(timer)
      deadline.signal.removeEventListener('abort', cancel)
    }
  }

  const readViaFirecrawl = async (url: string): Promise<CrawledPage | null> => {
    if (deadline.signal.aborted) return null
    const result = await firecrawlScrape(url, { signal: deadline.signal, timeoutMs: FIRECRAWL_PAGE_TIMEOUT })
    if (!result.ok) return null
    return parseFirecrawlPage(result.markdown, result.title, url)
  }

  const read = async (url: string): Promise<CrawledPage | null> => {
    diagnostics.attempted++
    onProgress?.(pages.length, maxPages, url)
    const cached = cache.get(url)
    if (!options.forceRefresh && cached && cached.expires > Date.now()) { diagnostics.cached++; return cached.page }
    let page: CrawledPage | null
    if (options.reader === 'firecrawl') {
      page = await readViaFirecrawl(url)
    } else {
      // Tier 1: Fast direct fetch first (200-400ms for 90%+ of sites)
      page = await readViaDirect(url)
      // Tier 2: Fall back to Jina only if direct fetch was blocked or failed
      if (!page && !deadline.signal.aborted) page = await readViaJina(url)
      // Tier 3: Fall back to Firecrawl if both failed
      if (!page && !deadline.signal.aborted) page = await readViaFirecrawl(url)
    }
    if (page) {
      if (cache.size >= 60) cache.delete(cache.keys().next().value!)
      cache.set(url, { page, expires: Date.now() + 5 * 60 * 1000 })
    }
    return page
  }

  // Step 0: Kick off sitemap discovery concurrently to discover canonical high-value pages
  const sitemapPromise = discoverSitemapLinks(baseUrl, deadline.signal).catch(() => [] as string[])

  // Step 1: Read homepage immediately (zero pre-crawl lag, starts in 0ms)
  const home = await read(normalizeSiteUrl(baseUrl))
  if (home) {
    const fingerprint = cleanPageForAi(home.markdown).replace(/\s+/g, ' ').toLowerCase()
    fingerprints.add(fingerprint)
    pages.push(home)
    onProgress?.(pages.length, maxPages, home.url)
    for (const link of discoverLinks(home, baseUrl)) {
      if (!enqueued.has(link) && enqueued.size < maxPages * 4) {
        enqueued.add(link)
        queue.push(link)
      }
    }

    // Await fast sitemap results (up to 800ms) to prioritize canonical commercial pages
    const sitemapLinks = await Promise.race([
      sitemapPromise,
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 800)),
    ])
    for (const link of sitemapLinks) {
      if (!enqueued.has(link) && enqueued.size < maxPages * 4) {
        enqueued.add(link)
        queue.push(link)
      }
    }
  }

  try {
    while (queue.length && pages.length < maxPages && diagnostics.attempted < maxPages * 2 && !deadline.signal.aborted) {
      queue.sort((a, b) => linkPriority(b) - linkPriority(a))
      const batch = queue.splice(0, Math.min(concurrency, maxPages - pages.length, maxPages * 2 - diagnostics.attempted))
      const responses = await Promise.all(batch.map(read))
      for (const page of responses) {
        if (!page) { diagnostics.failed++; continue }
        for (const link of discoverLinks(page, baseUrl)) {
          if (!enqueued.has(link) && enqueued.size < maxPages * 4) { enqueued.add(link); queue.push(link) }
        }
        const fingerprint = cleanPageForAi(page.markdown).replace(/\s+/g, ' ').toLowerCase()
        if (fingerprints.has(fingerprint)) { diagnostics.duplicates++; continue }
        fingerprints.add(fingerprint)
        pages.push(page)
        onProgress?.(pages.length, maxPages, page.url)
      }
    }
    if (options.signal?.aborted) throw new DOMException('Website reading was cancelled.', 'AbortError')
    if (deadline.signal.aborted) diagnostics.warnings.push('The website reading time limit was reached. Available pages were kept.')
    if (diagnostics.failed) diagnostics.warnings.push(`${diagnostics.failed} unavailable or invalid pages were skipped.`)
    return { pages, diagnostics }
  } finally {
    clearTimeout(budgetTimer)
    options.signal?.removeEventListener('abort', abort)
    diagnostics.elapsed_ms = Date.now() - started
  }
}

