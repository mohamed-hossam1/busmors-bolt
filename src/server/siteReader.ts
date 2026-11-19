import 'server-only'
import { cleanPageForAi, type CrawledPage } from '../lib/crawlContent'

export type CrawlProgressCallback = (read: number, total: number, currentUrl?: string) => void
export const DEFAULT_CRAWL_PAGES = 10
export interface CrawlOptions {
  signal?: AbortSignal
  timeoutMs?: number
  budgetMs?: number
  concurrency?: number
  forceRefresh?: boolean
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
  const path = new URL(url).pathname
  return /about|product|service|solution|pricing|feature|company|audience|customer/i.test(decodeURI(path)) ? 10 : /contact|faq|partner/i.test(path) ? 5 : 0
}

function discoverLinks(page: CrawledPage, base: string): string[] {
  const links = new Set<string>()
  for (const match of page.markdown.matchAll(/(?<!!)\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)) {
    try {
      const url = normalizeSiteUrl(match[1], page.url)
      if (!sameSite(url, base)) continue
      const path = decodeURI(new URL(url).pathname)
      if (/\.(?:png|jpe?g|gif|webp|avif|svg|pdf|zip|mp4|mp3|css|js)$/i.test(path)) continue
      if (/(?:^|\/)(?:login|signin|signup|sign-in|sign-up|cart|checkout|privacy|terms|legal|cookie|careers?|jobs?|blog|news|author|tag)(?:\/|$)/i.test(path)) continue
      links.add(url)
    } catch { /* Ignore malformed links and non-web protocols. */ }
  }
  return [...links].sort((a, b) => linkPriority(b) - linkPriority(a))
}

function parsePage(raw: string, url: string): CrawledPage | null {
  // The reader's HTTP status does not necessarily describe the target page.
  const marker = raw.indexOf('Markdown Content:')
  const metadata = marker >= 0 ? raw.slice(0, marker) : ''
  if (/Warning:\s*Target URL returned error\s*[45]\d\d/i.test(metadata)) return null
  const markdown = (marker >= 0 ? raw.slice(marker + 'Markdown Content:'.length) : raw).trim()
  const title = metadata.match(/^Title:\s*(.+)$/m)?.[1]?.trim()
  const cleaned = cleanPageForAi(markdown)
  if (cleaned.length < 80 || /^(?:404\s*)?(?:#{1,6}\s*)?(?:404\b|page not found\b|not found\b|access denied\b|just a moment\b|checking your browser\b)/i.test(cleaned.slice(0, 500)) || /^(?:404\b|page not found\b|access denied\b|just a moment\b)/i.test(title || '')) return null
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

export async function crawlPages(baseUrl: string, requestedMax = DEFAULT_CRAWL_PAGES, onProgress?: CrawlProgressCallback, options: CrawlOptions = {}): Promise<{ pages: CrawledPage[]; diagnostics: CrawlDiagnostics }> {
  const maxPages = Math.max(1, Math.min(20, Math.floor(requestedMax) || DEFAULT_CRAWL_PAGES))
  const concurrency = Math.max(1, Math.min(3, Math.floor(options.concurrency ?? 3) || 3))
  const started = Date.now()
  const diagnostics: CrawlDiagnostics = { attempted: 0, failed: 0, duplicates: 0, cached: 0, elapsed_ms: 0, warnings: [] }
  const queue = [normalizeSiteUrl(baseUrl)]
  const enqueued = new Set(queue)
  const fingerprints = new Set<string>()
  const pages: CrawledPage[] = []
  const deadline = new AbortController()
  // Allow the initial page plus enough parallel batches to attempt the configured page count.
  const budgetMs = options.budgetMs ?? Math.max(12000, (1 + Math.ceil((maxPages - 1) / concurrency)) * (options.timeoutMs ?? 6000) + 1000)
  const budgetTimer = setTimeout(() => deadline.abort(), budgetMs)
  const abort = () => deadline.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) deadline.abort()

  const read = async (url: string): Promise<CrawledPage | null> => {
    diagnostics.attempted++
    onProgress?.(pages.length, maxPages, url)
    const cached = cache.get(url)
    if (!options.forceRefresh && cached && cached.expires > Date.now()) { diagnostics.cached++; return cached.page }
    for (let attempt = 0; attempt < 2 && !deadline.signal.aborted; attempt++) {
      const controller = new AbortController()
      const cancel = () => controller.abort()
      deadline.signal.addEventListener('abort', cancel, { once: true })
      if (deadline.signal.aborted) controller.abort()
      const timer = setTimeout(cancel, options.timeoutMs ?? 6000)
      try {
        const response = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' }, cache: 'no-store', signal: controller.signal })
        if (!response.ok) {
          if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
            const seconds = Number(response.headers.get('Retry-After') || 1)
            if (!Number.isFinite(seconds) || seconds > 2) break
            await new Promise<void>((resolve) => {
              const finish = () => { clearTimeout(wait); deadline.signal.removeEventListener('abort', finish); resolve() }
              const wait = setTimeout(finish, Math.max(250, seconds * 1000))
              deadline.signal.addEventListener('abort', finish, { once: true })
              if (deadline.signal.aborted) finish()
            })
            continue
          }
          break
        }
        const page = parsePage(await response.text(), url)
        if (page) {
          if (cache.size >= 60) cache.delete(cache.keys().next().value!)
          cache.set(url, { page, expires: Date.now() + 5 * 60 * 1000 })
        }
        return page
      } catch {
        if (controller.signal.aborted || deadline.signal.aborted || attempt === 1) break
      } finally {
        clearTimeout(timer)
        deadline.signal.removeEventListener('abort', cancel)
      }
    }
    return null
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
