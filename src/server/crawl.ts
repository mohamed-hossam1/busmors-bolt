import 'server-only'
import type { BrainCategory } from '../lib/types'
import { callAi } from './call-ai'
import { createServerSupabase } from './supabase'
import { saveCrawlKnowledge } from './crawlStorage'
export { saveCrawlKnowledge } from './crawlStorage'
import { CRAWL_CATEGORIES, CRAWL_PROMPTS } from './ai/crawl-prompts'
import { getModelConfigForOperation } from '../config/ai-models'
import { buildPageBlocks, cleanTitle, dedupeCandidates, extractCandidates, normalizedEvidence, sanitizeEvidence, truncateWords, type CrawledPage, type ExtractedCandidate } from '../lib/crawlContent'
import { crawlPages, DEFAULT_CRAWL_PAGES, normalizeSiteUrl, type CrawlDiagnostics, type CrawlOptions, type CrawlProgressCallback } from './siteReader'
import { fetchSiteJsonLd } from './jsonLd'

export { cleanPageForAi, cleanTitle } from '../lib/crawlContent'
export type { CrawledPage, ExtractedCandidate } from '../lib/crawlContent'
export type { CrawlOptions, CrawlProgressCallback } from './siteReader'
export { DEFAULT_CRAWL_PAGES } from './siteReader'

export interface CrawlResult {
  pages_read: number
  pages: CrawledPage[]
  candidates: ExtractedCandidate[]
  diagnostics: CrawlDiagnostics
}

export async function extractKnowledgeFromSite(rawUrl: string, onProgress?: CrawlProgressCallback, maxPages = DEFAULT_CRAWL_PAGES, options: CrawlOptions = {}): Promise<CrawlResult> {
  const base = normalizeSiteUrl(rawUrl)
  onProgress?.(0, maxPages, base)

  // Concurrent high-speed Schema.org JSON-LD probe for instant structured ground truth
  const jsonLdPromise = fetchSiteJsonLd(base, options.signal).catch(() => [])

  // Fast direct crawl: page 1 reads immediately at t=0ms via Jina / Direct HTML fetch
  const crawled = await crawlPages(base, maxPages, onProgress, options)
  const pages = crawled.pages
  const diagnostics = crawled.diagnostics

  // Await structured JSON-LD candidates (race with 600ms timeout so crawl is never stalled)
  const jsonLdCandidates = await Promise.race([
    jsonLdPromise,
    new Promise<ExtractedCandidate[]>((resolve) => setTimeout(() => resolve([]), 600)),
  ])

  const heuristicCandidates = extractCandidates(base, pages)
  const candidates = dedupeCandidates([...jsonLdCandidates, ...heuristicCandidates])

  return { pages_read: pages.length, pages, candidates, diagnostics }
}

function parseJson(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid extraction response')
  return parsed as Record<string, unknown>
}

export interface SiteAnalysisOptions {
  token?: string
  language?: 'ar' | 'en'
}

/**
 * Simple programmatic check:
 * Checks if the scraped content contains Arabic words/characters.
 * If Arabic text is present, then the content is definitively Arabic (regardless of URL).
 */
export function hasArabicContent(text: string): boolean {
  if (!text) return false
  const arabicMatches = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g)
  return (arabicMatches?.length ?? 0) >= 5
}

export function detectLanguageFromCorpus(text: string, _url?: string): 'ar' | 'en' {
  return hasArabicContent(text) ? 'ar' : 'en'
}


const CATEGORY_SYNONYMS: Record<string, BrainCategory> = {
  product: 'offering',
  products: 'offering',
  service: 'offering',
  services: 'offering',
  offering: 'offering',
  offerings: 'offering',
  solution: 'offering',
  solutions: 'offering',
  equipment: 'offering',
  packages: 'offering',
  package: 'offering',
  fact: 'company_fact',
  facts: 'company_fact',
  company_fact: 'company_fact',
  contact: 'company_fact',
  location: 'company_fact',
  locations: 'company_fact',
  pricing: 'company_fact',
  goal: 'strategic_goal',
  goals: 'strategic_goal',
  strategic_goal: 'strategic_goal',
  mission: 'strategic_goal',
  vision: 'strategic_goal',
  differentiation: 'positioning',
  positioning: 'positioning',
  channel: 'channel',
  channels: 'channel',
  social: 'channel',
  social_media: 'channel',
  profile: 'company_profile',
  company: 'company_profile',
  company_profile: 'company_profile',
  about: 'company_profile',
  audience: 'audience',
  audiences: 'audience',
  customer: 'audience',
  customers: 'audience',
  target_audience: 'audience',
  brand_rule: 'brand_rule',
  brand: 'brand_rule',
  tone: 'brand_rule',
  voice: 'brand_rule',
  competitor: 'competitor',
  competitors: 'competitor',
}

export async function aiExtractKnowledge(pages: CrawledPage[], options: SiteAnalysisOptions = {}): Promise<ExtractedCandidate[]> {
  return (await analyzeSiteKnowledge(pages, options)).candidates
}

export interface SiteAnalysis {
  candidates: ExtractedCandidate[]
  relations: ExtractedRelation[]
  warnings: string[]
}

/** One bounded request covers all pages within the provider TPM budget; a failure keeps the fallback. */
export async function analyzeSiteKnowledge(pages: CrawledPage[], options: SiteAnalysisOptions = {}): Promise<SiteAnalysis> {
  const batches = [await analyzeBatch(pages, options)]
  const candidates = dedupeCandidates(batches.flatMap((batch) => batch.candidates))
  const relations = batches.flatMap((batch) => batch.relations.map((edge) => ({ ...edge,
    source_index: candidates.indexOf(batch.candidates[edge.source_index]),
    target_index: candidates.indexOf(batch.candidates[edge.target_index]),
  })))
  return { candidates, relations: validateRelations(candidates, relations), warnings: [...new Set(batches.flatMap((batch) => batch.warnings))] }
}

async function analyzeBatch(pages: CrawledPage[], options: SiteAnalysisOptions = {}): Promise<SiteAnalysis> {
  const empty: SiteAnalysis = { candidates: [], relations: [], warnings: [] }
  if (!pages.length) return empty
  const { text } = buildPageBlocks(pages, 20000)
  const detectedLang = detectLanguageFromCorpus(text, pages[0]?.url)
  const lang = options.language || detectedLang
  const isArabic = lang === 'ar'
  const operation = isArabic ? 'extract_ar' : 'extract'
  const systemPrompt = isArabic ? CRAWL_PROMPTS.extract_ar : CRAWL_PROMPTS.extract

  const crawlConfig = getModelConfigForOperation(operation)
  const extractCall = () => callAi({ systemPrompt, userPrompt: isArabic ? `محتوى الموقع:\n${text}` : text,
    maxTokens: crawlConfig.maxTokens, temperature: crawlConfig.temperature ?? 0.2, jsonMode: true, useSharedCrawlKey: true, crawlOperation: operation,
    reasoningEffort: crawlConfig.reasoningEffort ?? 'low' }, options.token)
  let ai = await extractCall()
  if (!ai.ok && ai.retryable) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    ai = await extractCall()
  }
  if (!ai?.ok || !ai.text) return { ...empty, warnings: [`AI analysis unavailable (${ai?.reason || ai?.error || 'empty response'}).`] }
  let parsed: Record<string, unknown>
  try {
    parsed = parseJson(ai.text)
  } catch {
    // Broken JSON: one repair call (same as bus2) instead of dropping the batch.
    try {
      const fix = await callAi({ systemPrompt,
        userPrompt: `The following should be a JSON object with a "candidates" array but it is broken. Return ONLY corrected JSON:\n\n${ai.text.slice(0, 4000)}`,
        maxTokens: crawlConfig.maxTokens, temperature: 0.1, jsonMode: true, useSharedCrawlKey: true, crawlOperation: operation, reasoningEffort: crawlConfig.reasoningEffort ?? 'low' }, options.token)
      if (!fix.ok || !fix.text) return { ...empty, warnings: ['AI returned incomplete or invalid JSON.'] }
      parsed = parseJson(fix.text)
    } catch {
      return { ...empty, warnings: ['AI returned incomplete or invalid JSON.'] }
    }
  }
  try {
    if (!Array.isArray(parsed.candidates)) return { ...empty, warnings: ['AI returned an invalid extraction format.'] }
    const output: ExtractedCandidate[] = []
    const byOriginalIndex = new Map<number, ExtractedCandidate>()
    for (const [originalIndex, value] of parsed.candidates.slice(0, 60).entries()) {
      if (!value || typeof value !== 'object') continue
      const c = value as Record<string, unknown>
      const rawCategory = String(c.category || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
      const category = (CRAWL_CATEGORIES.includes(c.category as BrainCategory) ? c.category : CATEGORY_SYNONYMS[rawCategory]) as BrainCategory | undefined
      if (!category) continue
      if (typeof c.title !== 'string' || !c.title.trim() || typeof c.summary !== 'string' || !c.summary.trim()) continue

      const index = typeof c.page_id === 'string' ? /^p([1-9]\d*)$/.exec(c.page_id) : null
      const page = (index && pages[Number(index[1]) - 1]) || pages[0]
      const rawQuote = typeof c.evidence_quote === 'string' && c.evidence_quote.trim() ? c.evidence_quote.trim() : c.summary.trim()
      const quote = truncateWords(sanitizeEvidence(rawQuote), 500)
      const confidence = typeof c.confidence === 'number' && Number.isFinite(c.confidence) ? Math.max(0.65, Math.min(0.98, c.confidence)) : 0.9

      output.push({
        category,
        title: cleanTitle(c.title),
        summary: truncateWords(sanitizeEvidence(c.summary), 350),
        source_url: page.url,
        confidence,
        verification_state: 'source_supported',
        properties: {
          extracted_by: 'ai',
          evidence_quote: sanitizeEvidence(quote),
        },
      })
      byOriginalIndex.set(originalIndex, output[output.length - 1])
    }
    const candidates = dedupeCandidates(output)
    const remap = (original: unknown) => {
      const item = typeof original === 'number' && Number.isInteger(original) ? byOriginalIndex.get(original) : undefined
      return item ? candidates.findIndex((c) => c.category === item.category && normalizedEvidence(c.title) === normalizedEvidence(item.title)) : -1
    }
    const edges = Array.isArray(parsed.edges) ? parsed.edges.map((edge: unknown) => {
      if (!edge || typeof edge !== 'object') return null
      const e = edge as Record<string, unknown>
      return { ...e, source_index: remap(e.source_index), target_index: remap(e.target_index) }
    }) : []
    return { candidates, relations: validateRelations(candidates, edges), warnings: candidates.length ? [] : ['AI returned no facts with verifiable source quotes.'] }
  } catch (error) {
    console.warn('Invalid website extraction response:', error)
    return { ...empty, warnings: ['AI returned incomplete or invalid JSON.'] }
  }
}

/** Try the server for authenticated crawls; never probe availability by reading a secret. */
export async function isAiExtractionAvailable(): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getSession()
  return Boolean(data.session)
}

export type RelationType = 'TARGETS' | 'COMPETES_WITH' | 'HAS_TONE' | 'SOLVES_PAIN_POINT' | 'RELATED_TO'
export interface ExtractedRelation {
  source_index: number
  target_index: number
  relation_type: RelationType
  source_url: string
  evidence_quote: string
  confidence: number
}

export async function aiExtractRelations(candidates: ExtractedCandidate[]): Promise<ExtractedRelation[]> {
  if (candidates.length < 2 || !candidates.some((c) => c.properties.extracted_by === 'ai')) return []
  const input = candidates.map((c, index) => ({ index, category: c.category, title: c.title, summary: c.summary,
    source_url: c.source_url, evidence_quote: c.properties.evidence_quote }))
  const relateConfig = getModelConfigForOperation('relate')
  const ai = await callAi({ systemPrompt: CRAWL_PROMPTS.relate, userPrompt: JSON.stringify(input),
    maxTokens: relateConfig.maxTokens ?? 2500, temperature: relateConfig.temperature ?? 0.1, jsonMode: true, useSharedCrawlKey: true, crawlOperation: 'relate',
    reasoningEffort: relateConfig.reasoningEffort ?? 'high' })
  if (!ai.ok || !ai.text) return []
  try {
    const parsed = parseJson(ai.text)
    if (!Array.isArray(parsed.edges)) return []
    return validateRelations(candidates, parsed.edges)
  } catch { return [] }
}

export function validateRelations(candidates: ExtractedCandidate[], values: unknown[]): ExtractedRelation[] {
  const edges: ExtractedRelation[] = []
  const seen = new Set<string>()
  const allowed = new Set(['TARGETS', 'COMPETES_WITH', 'HAS_TONE', 'SOLVES_PAIN_POINT', 'RELATED_TO'])
  for (const value of values) {
    if (!value || typeof value !== 'object') continue
    const e = value as Record<string, unknown>
    if (!Number.isInteger(e.source_index) || !Number.isInteger(e.target_index) || e.source_index === e.target_index || !allowed.has(String(e.relation_type)) || typeof e.evidence_quote !== 'string' || typeof e.source_url !== 'string') continue
    const source = candidates[e.source_index as number]
    const target = candidates[e.target_index as number]
    if (!source || !target) continue
    const compatibility: Record<string, boolean> = {
      TARGETS: ['offering', 'positioning'].includes(source.category) && target.category === 'audience',
      COMPETES_WITH: ['company_profile', 'offering'].includes(source.category) && target.category === 'competitor',
      HAS_TONE: ['company_profile', 'offering'].includes(source.category) && target.category === 'brand_rule',
      SOLVES_PAIN_POINT: source.category === 'offering' && target.category === 'audience', RELATED_TO: true,
    }
    const evidence = normalizedEvidence(e.evidence_quote)
    if (!compatibility[String(e.relation_type)] || e.evidence_quote.length > 500) continue
    const key = `${e.source_index}:${e.target_index}:${e.relation_type}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push({ source_index: e.source_index as number, target_index: e.target_index as number, relation_type: e.relation_type as RelationType,
      source_url: e.source_url, evidence_quote: e.evidence_quote, confidence: typeof e.confidence === 'number' && Number.isFinite(e.confidence) ? Math.max(0, Math.min(0.95, e.confidence)) : 0.65 })
  }
  return edges.slice(0, 12)
}

/** Same-company source context, never an inferred product/audience claim. */
export function prepareSiteKnowledge(pages: CrawledPage[], fallback: ExtractedCandidate[], analysis: SiteAnalysis) {
  // If AI produced business candidates, use AI knowledge directly without polluting with regex heuristics.
  // Fallback is only merged if AI produced 0 candidates.
  const baseCandidates = analysis.candidates.length > 0 ? analysis.candidates : fallback
  const candidates = dedupeCandidates(baseCandidates)
  const mapped = analysis.relations.map((edge) => ({ ...edge,
    source_index: candidates.indexOf(analysis.candidates[edge.source_index]),
    target_index: candidates.indexOf(analysis.candidates[edge.target_index]),
  }))
  const relations = validateRelations(candidates, mapped)
  const profileIndex = candidates.findIndex((candidate) => candidate.category === 'company_profile')
  const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')
  if (profileIndex >= 0) {
    const profile = candidates[profileIndex]
    for (const [index, candidate] of candidates.entries()) {
      if (relations.length >= 12) break
      if (index === profileIndex || candidate.category === 'company_profile' || candidate.category === 'competitor' || host(candidate.source_url) !== host(profile.source_url)) continue
      if (relations.some((edge) => edge.source_index === profileIndex && edge.target_index === index || edge.target_index === profileIndex && edge.source_index === index)) continue
      const quote = String(candidate.properties.evidence_quote || '')
      relations.push({ source_index: profileIndex, target_index: index, relation_type: 'RELATED_TO',
        source_url: candidate.source_url, evidence_quote: quote, confidence: Math.min(0.65, profile.confidence, candidate.confidence) })
    }
  }
  return { candidates, relations: validateRelations(candidates, relations) }
}

export async function organizeBrainWithAi(websiteUrl: string, workspaceId: string, onProgress?: (status: string) => void): Promise<{ success: boolean; nodesCount: number; edgesCount: number; error?: string; warning?: string }> {
  const supabase = await createServerSupabase()
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user.id !== workspaceId) throw new Error('Please sign in to your workspace again.')
    const token = data.session?.access_token
    const result = await extractKnowledgeFromSite(websiteUrl, (read, total) => onProgress?.(`Reading website content (${read}/${total} pages)...`), DEFAULT_CRAWL_PAGES, { forceRefresh: true })
    if (!result.pages.length) throw new Error('Could not read useful website content. Your existing knowledge has been kept.')
    onProgress?.('Extracting supported business knowledge...')
    const analysis = await analyzeSiteKnowledge(result.pages, { token })
    const aiCandidates = analysis.candidates
    const { candidates, relations } = prepareSiteKnowledge(result.pages, result.candidates, analysis)
    onProgress?.('Saving website knowledge...')
    // Degraded extraction may add review candidates, but must not replace a better Brain.
    const counts = await saveCrawlKnowledge(websiteUrl, candidates, relations, result.pages_read, aiCandidates.length > 0 && analysis.warnings.length === 0, workspaceId)
    return { success: true, ...counts, warning: counts.warning || (analysis.warnings.length ? analysis.warnings.join(' ') + ' Source-backed suggestions were saved for review; existing knowledge was kept.' : undefined) }
  } catch (error) {
    return { success: false, nodesCount: 0, edgesCount: 0, error: error instanceof Error ? error.message : 'Could not organize website knowledge.' }
  }
}
