import type { SourceRecord, StoragePolicy, UsageRecord, ProviderName } from '../contracts'
import { emptyUsage } from '../contracts'

const TRACKING = /^(utm_|fbclid$|gclid$|msclkid$|mc_cid$|mc_eid$|ref$|ref_src$)/i

/** Canonical URL: no tracking parameters, no hash, lowercase host, one trailing slash. */
export function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ''
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key)
    for (const key of [...url.searchParams.keys()]) if (!url.searchParams.get(key)) url.searchParams.delete(key)
    url.searchParams.sort()
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${url.host}${path}${url.search}`
  } catch {
    return raw.trim()
  }
}

/** Stable non-cryptographic content hash used to dedupe identical captures. */
export function hashText(text: string): string {
  let a = 0x811c9dc5
  let b = 0x1000193
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = Math.imul(b + code, 0x85ebca6b) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** A readable excerpt. An empty source stays empty instead of being invented. */
export function excerptOf(markdown: string, maxLength = 600): string {
  const cleaned = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= maxLength) return cleaned
  const cut = cleaned.slice(0, maxLength)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('؟ '), cut.lastIndexOf('! '))
  return (lastStop > maxLength * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim()
}

export interface SourceInput {
  id: string
  url: string
  title: string
  provider: ProviderName
  discoveredBy?: ProviderName | null
  toolAction: string
  toolkitVersion: string
  excerpt: string
  availability: SourceRecord['availability']
  storagePolicy?: StoragePolicy
  usage?: Partial<UsageRecord>
  credits?: number
  publishedAt?: string | null
  capturedAt?: string
  market?: string | null
  sector?: string | null
  authority?: string | null
  authorityScore?: number
  geography?: string | null
  period?: string | null
  blockedReason?: string | null
  sourceType?: string
}

/** One place where a provider result becomes an inspectable source record. */
export function toSourceRecord(input: SourceInput): SourceRecord {
  const canonical = canonicalizeUrl(input.url)
  return {
    id: input.id,
    url: input.url,
    canonicalUrl: canonical,
    title: input.title.slice(0, 500),
    provider: input.provider,
    discoveredBy: input.discoveredBy ?? null,
    toolAction: input.toolAction,
    toolkitVersion: input.toolkitVersion,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    publishedAt: input.publishedAt ?? null,
    excerpt: input.availability === 'retrieved' || input.availability === 'partial' ? input.excerpt.slice(0, 8000) : '',
    contentHash: hashText(`${canonical}|${input.availability}|${input.availability === 'retrieved' ? input.excerpt : input.blockedReason ?? ''}`),
    availability: input.availability,
    storagePolicy: input.storagePolicy ?? 'workspace',
    usage: { ...emptyUsage(), ...input.usage },
    credits: input.credits ?? input.usage?.credits ?? 0,
    market: input.market ?? 'EG',
    sector: input.sector ?? null,
    authority: input.authority ?? null,
    authorityScore: input.authorityScore ?? 0.5,
    geography: input.geography ?? null,
    period: input.period ?? null,
    blockedReason: input.blockedReason ?? (input.availability === 'retrieved' ? null : 'The provider could not retrieve this page.'),
    sourceType: input.sourceType ?? 'website',
  }
}

/** A blocked page is an honest source record, never fabricated content. */
export function blockedSource(input: {
  id: string
  url: string
  provider: ProviderName
  discoveredBy?: ProviderName | null
  toolAction: string
  toolkitVersion: string
  reason: string
  availability?: 'blocked' | 'unavailable'
  usage?: Partial<UsageRecord>
  sector?: string | null
  geography?: string | null
}): SourceRecord {
  return toSourceRecord({
    id: input.id,
    url: input.url,
    title: `Unavailable source: ${input.url}`,
    provider: input.provider,
    discoveredBy: input.discoveredBy ?? null,
    toolAction: input.toolAction,
    toolkitVersion: input.toolkitVersion,
    excerpt: '',
    availability: input.availability ?? 'blocked',
    blockedReason: input.reason,
    usage: input.usage,
    sector: input.sector ?? null,
    geography: input.geography ?? null,
  })
}

/** Discovery candidates are URLs with a reason; they are not sources yet. */
export interface CandidateUrl {
  url: string
  title: string
  snippet: string
  provider: ProviderName
  score?: number
}

export function dedupeCandidates(candidates: CandidateUrl[]): CandidateUrl[] {
  const seen = new Set<string>()
  const output: CandidateUrl[] = []
  for (const candidate of candidates) {
    const key = canonicalizeUrl(candidate.url)
    if (seen.has(key)) continue
    seen.add(key)
    output.push({ ...candidate, url: key })
  }
  return output
}

/** Normalised query identity so the same search is not repeated across providers. */
export function normalizeQuery(query: string): string {
  return query
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}