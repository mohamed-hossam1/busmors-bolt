/**
 * Deterministic evidence and calculation provenance ledger (spec §3.6, §4.4, §6.4).
 *
 * Pure and in-memory per agent run. Tracks ONLY real, non-empty tool outcomes
 * so Research cannot pass with empty/failed calls or fabricated URLs, and
 * Marketing Analyst carries reproducible calculation provenance.
 */

export interface RetrievedEvidenceItem {
  tool: string
  kind: 'search_hit' | 'scraped_page' | 'connector_read' | 'workspace_record'
  url?: string
  title?: string
  excerpt?: string
}

export interface CalculationProvenanceRef {
  tool: string
  operation: string
  inputs: Record<string, unknown>
  value: unknown
  unit?: string | null
}

const HTTP_URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi

/** Extract http(s) URLs from text, stripping trailing punctuation. */
export function extractHttpUrls(text: string): string[] {
  const matches = text.match(HTTP_URL_RE) ?? []
  const out: string[] = []
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?)\]}'"]+$/, '')
    if (/^https?:\/\/[^/]+/i.test(cleaned)) out.push(cleaned)
  }
  return [...new Set(out)]
}

/** Normalize URL for grounding comparison (ignore trailing slash & www prefix). */
export function normalizeUrlForMatch(raw: string): string {
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '') || ''
    return `${host}${path}${u.search}`.toLowerCase()
  } catch {
    return raw.trim().replace(/\/+$/, '').toLowerCase()
  }
}

export class EvidenceLedger {
  private readonly items: RetrievedEvidenceItem[] = []
  private readonly urlSet = new Set<string>()
  private readonly rawUrls: string[] = []
  private readonly calcRefs: CalculationProvenanceRef[] = []

  seedKnownUrls(urls: string[]): void {
    for (const url of urls) this.addUrl(url)
  }

  private addUrl(url: string): void {
    const norm = normalizeUrlForMatch(url)
    if (!this.urlSet.has(norm)) {
      this.urlSet.add(norm)
      this.rawUrls.push(url)
    }
  }

  recordToolOutcome(tool: string, args: Record<string, unknown>, ok: boolean, output: unknown): void {
    if (!ok || output === null || output === undefined) return
    const record = typeof output === 'object' && !Array.isArray(output) ? (output as Record<string, unknown>) : null

    if (tool === 'tavily_search' || tool === 'exa_search') {
      const hits = Array.isArray(record?.hits) ? (record.hits as Record<string, unknown>[]) : []
      for (const hit of hits) {
        const url = typeof hit.url === 'string' ? hit.url.trim() : ''
        const title = typeof hit.title === 'string' ? hit.title.trim() : ''
        const snippet = typeof hit.snippet === 'string' ? hit.snippet.trim() : ''
        if (!/^https?:\/\//i.test(url) || (!title && !snippet)) continue
        this.addUrl(url)
        this.items.push({ tool, kind: 'search_hit', url, title, excerpt: snippet.slice(0, 300) })
      }
      return
    }

    if (tool === 'firecrawl_scrape') {
      const url = typeof record?.url === 'string' ? record.url.trim() : ''
      const title = typeof record?.title === 'string' ? record.title.trim() : ''
      const markdown = typeof record?.markdown === 'string' ? record.markdown.trim() : ''
      if (!/^https?:\/\//i.test(url) || markdown.length < 50) return
      this.addUrl(url)
      this.items.push({ tool, kind: 'scraped_page', url, title, excerpt: markdown.slice(0, 300) })
      return
    }

    if (tool === 'composio_read') {
      const data = record?.data
      if (data && typeof data === 'object' && Object.keys(data as Record<string, unknown>).length > 0) {
        for (const foundUrl of extractHttpUrls(JSON.stringify(data))) this.addUrl(foundUrl)
        this.items.push({ tool, kind: 'connector_read', excerpt: JSON.stringify(data).slice(0, 300) })
      }
      return
    }

    if (tool === 'read_business_brain' || tool === 'read_deliverables' || tool === 'read_calendar') {
      for (const foundUrl of extractHttpUrls(JSON.stringify(output))) {
        this.addUrl(foundUrl)
        this.items.push({ tool, kind: 'workspace_record', url: foundUrl })
      }
      return
    }

    if (tool === 'calculate' && record) {
      this.calcRefs.push({
        tool,
        operation: String(record.formula ?? args.formula ?? 'calculate'),
        inputs: (record.inputs as Record<string, unknown>) ?? (args.values as Record<string, unknown>) ?? {},
        value: record.value,
        unit: typeof record.unit === 'string' ? record.unit : null,
      })
      return
    }

    if (tool === 'analyze_data' && record) {
      this.calcRefs.push({
        tool,
        operation: String(args.op ?? 'analyze_data'),
        inputs: { column: args.column ?? null, groupBy: args.groupBy ?? null, sumColumn: args.sumColumn ?? null },
        value: record,
      })
    }
  }

  hasExternalEvidence(): boolean {
    return this.items.some((i) => i.kind === 'search_hit' || i.kind === 'scraped_page' || i.kind === 'connector_read')
  }

  hasCalculationProvenance(): boolean {
    return this.calcRefs.length > 0
  }

  retrievedUrls(): string[] {
    return [...this.rawUrls]
  }

  findUngroundedUrls(text: string): string[] {
    const cited = extractHttpUrls(text)
    if (cited.length === 0) return []
    return cited.filter((url) => {
      const norm = normalizeUrlForMatch(url)
      if (this.urlSet.has(norm)) return false
      // Allow domain-level match if the exact retrieved URL is a subpage or vice versa on the same host
      try {
        const citedUrl = new URL(url)
        const citedHost = citedUrl.hostname.toLowerCase().replace(/^www\./, '')
        for (const raw of this.rawUrls) {
          try {
            const retrieved = new URL(raw)
            const retrievedHost = retrieved.hostname.toLowerCase().replace(/^www\./, '')
            if (citedHost === retrievedHost && (citedUrl.pathname === '/' || citedUrl.pathname === '')) return true
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
      return true
    })
  }

  calculationSummaries(): string[] {
    return this.calcRefs.map((c) => `${c.tool}:${c.operation}=${JSON.stringify(c.value)}${c.unit ? c.unit : ''}`)
  }

  evidenceItems(): RetrievedEvidenceItem[] {
    return [...this.items]
  }
}
