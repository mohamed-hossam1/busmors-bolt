import type { BrainCategory } from './types'
import { callAi, hasActiveAiKey } from './agents'
import { supabase } from './supabase'

export interface ExtractedCandidate {
  category: BrainCategory
  title: string
  summary: string
  properties: Record<string, unknown>
  source_url: string
  confidence: number
}

export interface CrawlResult {
  pages_read: number
  pages: CrawledPage[]
  candidates: ExtractedCandidate[]
}

interface CrawledPage {
  url: string
  markdown: string
}

const ALL_CATEGORIES: BrainCategory[] = [
  'company_profile',
  'offering',
  'audience',
  'brand_rule',
  'positioning',
  'strategic_goal',
  'channel',
  'competitor',
  'company_fact',
]

/**
 * Reads a company website's public pages in the browser, then extracts
 * structured knowledge candidates: heuristic section-level parsing first,
 * then (when the user has an AI key or shared crawl key) an AI pass that re-reads
 * the pages and organizes clean, high-value candidates.
 */
export type CrawlProgressCallback = (read: number, total: number, currentUrl?: string) => void

export async function extractKnowledgeFromSite(
  rawUrl: string,
  onProgress?: CrawlProgressCallback,
  maxPages: number = 10
): Promise<CrawlResult> {
  const base = normalizeUrl(rawUrl)
  onProgress?.(0, maxPages, base.toString())
  const pages = await crawlPages(base.toString(), maxPages, onProgress)
  const candidates = extractCandidates(base.toString(), pages)
  return { pages_read: pages.length, pages, candidates }
}

/** Prepares markdown content for AI by stripping image clutter and link URLs */
export function cleanPageForAi(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // remove images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // unwrap links into text
    .replace(/https?:\/\/[^\s)]+/g, '') // strip raw URLs
    .replace(/^\s*[-*]\s*(?:home|about|products|services|pricing|careers?|blogs?|faq|f&q|contact\s*us?)\s*$/gim, '') // strip nav list lines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Clean and truncate titles at word boundaries without cutting words in half */
export function cleanTitle(title: string): string {
  let t = title.replace(/^[-–—#*:\s]+|[-–—#*:\s]+$/g, '').trim()
  if (t.length > 60) {
    const sub = t.slice(0, 60)
    const lastSpace = sub.lastIndexOf(' ')
    t = lastSpace > 20 ? sub.slice(0, lastSpace) : sub
  }
  return t
}

export async function aiExtractKnowledge(pages: CrawledPage[]): Promise<ExtractedCandidate[]> {
  if (pages.length === 0) return []
  const pageBlocks = pages
    .slice(0, 8)
    .map((p) => `=== PAGE: ${p.url} ===\n${cleanPageForAi(p.markdown).slice(0, 3000)}`)
    .join('\n\n')
    .slice(0, 22000)

  const ai = await callAi({
    systemPrompt:
      'You are an expert AI business intelligence analyst. Extract clean, structured, high-value business knowledge from the company website content for the company Brain.\n' +
      `Return STRICT JSON format: {"candidates":[{"category":"<one of: ${ALL_CATEGORIES.join('|')}>","title":"<=60 chars, clear name","summary":"<=280 chars, factual, cohesive sentence","confidence":0.95}]}\n` +
      'Produce 8-15 distinct candidates strictly following these category rules:\n' +
      '- company_profile: The company name, core identity, and primary value proposition (e.g. "AI-Powered Talent Intelligence Platform").\n' +
      '- offering: Distinct, named products, solutions, features, or services (e.g. "Talents Studio All-In-One Engine", "Talent Bot Automated Screening", "Tech Lab Development"). Do NOT use generic single words like "Source" or marketing CTA questions like "Not sure where to start?".\n' +
      '- audience: Target customer segments (e.g. "Enterprises, Startups & Government Agencies", "HR Leaders & Recruiters").\n' +
      '- positioning: Key competitive differentiators vs traditional models or competitors (e.g. "AI Platform vs Traditional Recruitment Agency").\n' +
      '- strategic_goal: Stated mission, vision, or quantitative milestone goals.\n' +
      '- brand_rule: Core brand voice, style, or communication tenets.\n' +
      '- company_fact: Official credentials (e.g. "Accredited by SDAIA"), verified partnerships, key statistics, locations.\n' +
      'Rules:\n' +
      '1. NEVER include raw navigation links, menu bars, or footer buttons (e.g. "Contact us Pricing Blogs").\n' +
      '2. NEVER cut off titles or summaries mid-word.\n' +
      '3. Only extract real information present in the text.',
    userPrompt: pageBlocks,
    maxTokens: 2500,
    temperature: 0.2,
    jsonMode: true,
    useSharedCrawlKey: true,
  })

  if (!ai.ok || !ai.text) return []

  try {
    // Strip markdown code fences if present (```json ... ```)
    const cleanedJson = ai.text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
    const parsed = JSON.parse(cleanedJson) as { candidates?: unknown[] }
    if (!Array.isArray(parsed.candidates)) return []
    const valid = new Set<string>(ALL_CATEGORIES)
    return parsed.candidates
      .filter(
        (c): c is { category: BrainCategory; title: string; summary: string; confidence?: number } =>
          typeof c === 'object' && c !== null &&
          'category' in c && typeof (c as { category: unknown }).category === 'string' &&
          valid.has((c as { category: string }).category as BrainCategory) &&
          'title' in c && typeof (c as { title: unknown }).title === 'string' &&
          'summary' in c && typeof (c as { summary: unknown }).summary === 'string' &&
          (c as { title: string }).title.trim().length > 1 &&
          (c as { summary: string }).summary.trim().length > 10
      )
      .slice(0, 16)
      .map((c) => ({
        category: c.category,
        title: cleanTitle(c.title.trim()),
        summary: c.summary.trim().slice(0, 280),
        properties: { extracted_by: 'ai' },
        source_url: pages[0]?.url ?? '',
        confidence: typeof c.confidence === 'number' ? Math.min(1, Math.max(0.7, c.confidence)) : 0.95,
      }))
  } catch (err) {
    console.error('Failed to parse AI extraction output:', err)
    return []
  }
}

export async function isAiExtractionAvailable(): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    if (!sessionData.session) return false

    // Check if user has an active AI key
    const hasKey = await hasActiveAiKey()
    if (hasKey) return true

    // Check if shared crawl key is accessible
    const { data: sharedKey } = await supabase.rpc('read_shared_crawl_key')
    return Boolean(sharedKey)
  } catch {
    return false
  }
}

export type RelationType = 'TARGETS' | 'COMPETES_WITH' | 'HAS_TONE' | 'SOLVES_PAIN_POINT' | 'RELATED_TO'

export interface ExtractedRelation {
  source_title: string
  target_title: string
  relation_type: RelationType
  confidence: number
}

/**
 * Derives relationships between extracted knowledge candidates. AI pass maps
 * semantic links; falls back to category heuristics so the graph is never empty.
 */
export async function aiExtractRelations(
  candidates: { category: BrainCategory; title: string }[]
): Promise<ExtractedRelation[]> {
  if (candidates.length < 2) return []

  const list = candidates.map((c) => `- [${c.category}] ${c.title}`).join('\n')
  const ai = await callAi({
    systemPrompt:
      'You map relationships between pieces of company knowledge. ' +
      `Return STRICT JSON only: {"edges":[{"source_title":"...","target_title":"...","relation_type":"<one of: TARGETS|COMPETES_WITH|HAS_TONE|SOLVES_PAIN_POINT|RELATED_TO>"}]} ` +
      'Meanings — TARGETS: an offering/positioning aimed at an audience; COMPETES_WITH: competitor vs company/offering; ' +
      'HAS_TONE: brand_rule describing the company/offering; SOLVES_PAIN_POINT: offering solving an audience need; ' +
      'RELATED_TO: any other meaningful link. Use the exact titles given. Produce 3-10 edges, only meaningful ones.',
    userPrompt: list,
    maxTokens: 800,
    temperature: 0.2,
    jsonMode: true,
    useSharedCrawlKey: true,
  })

  const valid = new Set<RelationType>(['TARGETS', 'COMPETES_WITH', 'HAS_TONE', 'SOLVES_PAIN_POINT', 'RELATED_TO'])
  const titles = new Set(candidates.map((c) => c.title.toLowerCase()))
  const clean = (edges: unknown): ExtractedRelation[] => {
    if (!Array.isArray(edges)) return []
    return edges
      .filter(
        (e): e is { source_title: string; target_title: string; relation_type: RelationType } =>
          typeof e === 'object' && e !== null &&
          'source_title' in e && 'target_title' in e && 'relation_type' in e &&
          titles.has(String((e as { source_title: unknown }).source_title).toLowerCase()) &&
          titles.has(String((e as { target_title: unknown }).target_title).toLowerCase()) &&
          valid.has((e as { relation_type: RelationType }).relation_type)
      )
      .map((e) => ({
        source_title: e.source_title,
        target_title: e.target_title,
        relation_type: e.relation_type,
        confidence: 0.75,
      }))
  }

  if (ai.ok && ai.text) {
    try {
      const cleanedJson = ai.text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
      const parsed = JSON.parse(cleanedJson) as { edges?: unknown }
      const cleaned = clean(parsed.edges)
      if (cleaned.length > 0) return cleaned.slice(0, 12)
    } catch {
      // fall through to heuristics
    }
  }
  return heuristicRelations(candidates)
}

/** Category-based fallback links when the AI pass is unavailable. */
function heuristicRelations(
  candidates: { category: BrainCategory; title: string }[]
): ExtractedRelation[] {
  const byCategory = (cat: BrainCategory) => candidates.filter((c) => c.category === cat)
  const profile = byCategory('company_profile')[0]
  const edges: ExtractedRelation[] = []
  const push = (source: { title: string } | undefined, target: { title: string } | undefined, relation_type: RelationType, confidence: number) => {
    if (source && target && source.title !== target.title) {
      edges.push({ source_title: source.title, target_title: target.title, relation_type, confidence })
    }
  }
  for (const offering of byCategory('offering').slice(0, 4)) {
    for (const audience of byCategory('audience').slice(0, 2)) push(offering, audience, 'TARGETS', 0.7)
    push(profile, offering, 'RELATED_TO', 0.65)
  }
  for (const competitor of byCategory('competitor').slice(0, 3)) push(competitor, profile, 'COMPETES_WITH', 0.7)
  for (const rule of byCategory('brand_rule').slice(0, 2)) push(rule, profile, 'HAS_TONE', 0.65)
  for (const positioning of byCategory('positioning').slice(0, 2)) push(positioning, profile, 'RELATED_TO', 0.6)
  const seen = new Set<string>()
  return edges
    .filter((e) => {
      const key = `${e.source_title}|${e.target_title}|${e.relation_type}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 10)
}

function normalizeUrl(raw: string): string {
  const withScheme = raw.startsWith('http') ? raw : `https://${raw}`
  return new URL(withScheme).toString()
}

async function crawlPages(
  baseUrl: string,
  maxPages: number = 10,
  onProgress?: (read: number, total: number, currentUrl?: string) => void
): Promise<CrawledPage[]> {
  const base = new URL(baseUrl)
  const origin = base.origin
  const queue: string[] = [base.toString(), origin + '/products', origin + '/about']
  const visited = new Set<string>()
  const pages: CrawledPage[] = []
  let seededCommonPaths = false

  while (queue.length > 0 && visited.size < maxPages * 2 && pages.length < maxPages) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    onProgress?.(pages.length, maxPages, current)

    try {
      const res = await fetch(`https://r.jina.ai/${current}`, {
        headers: { Accept: 'text/plain' },
      })
      if (res.ok) {
        const raw = await res.text()
        const markdown = stripMeta(raw)
        if (markdown.trim().length > 80) {
          pages.push({ url: current, markdown })
          onProgress?.(pages.length, maxPages, current)
        }
      }
    } catch {
      // skip unreachable page, continue with the rest
    }

    if (!seededCommonPaths && visited.size >= 2) {
      seededCommonPaths = true
      for (const path of ['/services', '/features', '/contact', '/pricing', '/solutions']) {
        const candidate = origin + path
        if (!visited.has(candidate)) queue.push(candidate)
      }
    }

    // collect internal links from fetched markdown (link targets inside [text](url))
    for (const page of pages) {
      for (const match of page.markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) {
        let absolute: URL
        try {
          absolute = new URL(match[1])
        } catch {
          continue
        }
        if (
          absolute.origin === origin &&
          !visited.has(absolute.toString()) &&
          !queue.includes(absolute.toString()) &&
          queue.length + visited.size < maxPages * 4
        ) {
          queue.push(absolute.toString())
        }
      }
    }
  }

  return pages.slice(0, maxPages)
}

function stripMeta(raw: string): string {
  const marker = 'Markdown Content:'
  const idx = raw.indexOf(marker)
  return idx >= 0 ? raw.slice(idx + marker.length) : raw
}

/** Plain text without markdown syntax, for sentence-level heuristics. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~|]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

interface Section {
  heading: string
  body: string
}

/** Splits a jina markdown page into (heading, body) sections.
 * Handles pages that use no markdown headings: a short standalone line
 * followed by a longer paragraph is treated as a question/section heading. */
function splitSections(markdown: string): Section[] {
  const lines = markdown.split('\n')
  const sections: Section[] = []
  let heading = 'intro'
  let body: string[] = []
  const flush = () => {
    if (body.join(' ').trim().length > 0) sections.push({ heading: heading.trim(), body: body.join(' ').trim() })
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^#{1,4}\s+(.*)$/)
    const trimmed = line.trim()
    if (m && /^heading[-\s]?[lsmd]+$/i.test(m[1].trim())) continue // style-guide junk from Webflow themes
    const questionHeading =
      m === null &&
      trimmed.length > 0 && trimmed.length <= 80 &&
      !trimmed.startsWith('!') && !trimmed.startsWith('[') &&
      (trimmed.endsWith('?') || trimmed.endsWith('؟') || trimmed.endsWith(':')) &&
      lines[i + 1]?.trim() === '' // heading lines stand alone; real headings end with ?/:/؟
    if (m || questionHeading) {
      flush()
      heading = m ? m[1].replace(/[#*_>`]/g, '').trim() : trimmed
      body = []
      continue
    }
    body.push(line)
  }
  flush()
  return sections
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+|\n+/)
    .map((s) => s.replace(/\s{2,}/g, ' ').trim())
    .filter((s) => s.length > 40 && s.length < 300)
}

function extractCandidates(baseUrl: string, pages: CrawledPage[]): ExtractedCandidate[] {
  const base = new URL(baseUrl)
  const candidates: ExtractedCandidate[] = []
  const company = base.hostname.replace(/^www\./, '').split('.')[0]

  // --- company profile: hero section of the homepage (heading + first meaty paragraph) ---
  const home = pages[0]
  if (home) {
    const hero = splitSections(home.markdown).find((s) => s.body.length > 80)
    if (hero) {
      const heading = hero.heading !== 'intro' ? hero.heading : ''
      const summary = toPlainText(hero.body).slice(0, 280)
      candidates.push({
        category: 'company_profile',
        title: cleanTitle(heading || cap(company)),
        summary: heading ? `${heading} — ${summary}`.slice(0, 280) : summary,
        properties: { website: base.origin },
        source_url: base.origin,
        confidence: 0.9,
      })
    }
  }

  // --- offerings: one candidate per meaningful section/paragraph on product-like pages or sections ---
  const productPagePattern = /product|service|solution|feature|offering|platform|pricing/i
  const offeringSections: { page: CrawledPage; heading: string; body: string }[] = []
  for (const page of pages) {
    const isProductPage = productPagePattern.test(page.url) || productPagePattern.test(page.markdown.slice(0, 400))
    for (const s of splitSections(page.markdown)) {
      const text = toPlainText(s.body)
      if (text.length < 120) continue
      const named = s.heading !== 'intro' && s.heading.length > 2 && !/^(home|menu|navigation|footer)$/i.test(s.heading)
      if (isProductPage && (named || text.length > 200)) {
        offeringSections.push({ page, heading: named ? s.heading : '', body: text })
      } else if (named && productPagePattern.test(s.heading)) {
        offeringSections.push({ page, heading: s.heading, body: text })
      }
    }
  }

  for (const { page, heading, body } of offeringSections.slice(0, 8)) {
    // Skip question headings (e.g. "Not sure where to start?", "Why choose us?", "FAQ")
    if (heading.endsWith('?') || heading.endsWith('؟') || /^(why|how|what|faq|ready to|get in touch|not sure)/i.test(heading)) {
      continue
    }
    // Skip single-word generic headings
    if (/^(source|overview|features|products|services|solutions|home|about|menu|more)$/i.test(heading)) {
      continue
    }

    const firstSentences = sentences(body).slice(0, 2).join(' ')
    if (!firstSentences) continue
    const rawTitle = heading || firstSentences.split(/[,:—–-]/)[0] || 'Offering'
    const title = cleanTitle(rawTitle)
    candidates.push({
      category: 'offering',
      title,
      summary: (heading ? `${heading}: ` : '') + firstSentences.slice(0, 280),
      properties: {},
      source_url: page.url,
      confidence: heading ? 0.85 : 0.7,
    })
  }

  // --- audience / positioning / strategic goal: pattern-matched sentences across all pages ---
  const allText = pages.map((p) => toPlainText(p.markdown)).join('\n')
  const pushSentenceMatch = (category: BrainCategory, pattern: RegExp, title: string, confidence: number) => {
    const match = sentences(allText).find((s) => pattern.test(s))
    if (match) {
      candidates.push({ category, title, summary: match.slice(0, 280), properties: {}, source_url: pages[0]?.url ?? base.origin, confidence })
    }
  }
  pushSentenceMatch(
    'audience',
    /for (?:SMBs|small businesses|startups|enterprises|teams|recruiters|HR|students|graduates|organizations|companies)|مصمم لـ|يخدم (?:الشركات|رواد|الشباب)/i,
    'Target audience',
    0.75,
  )
  pushSentenceMatch(
    'positioning',
    /unlike|the only|rather than traditional|goes beyond|redefin|transform|بشكل مختلف|الأول من نوعه/i,
    'Positioning statement',
    0.7,
  )
  pushSentenceMatch(
    'strategic_goal',
    /our (?:mission|vision|goal)|aims to|we (?:strive|aim)|رسالتنا|رؤيتنا|هدفنا/i,
    'Stated goal',
    0.75,
  )

  // --- facts: verified contact, credentials ---
  // Only extract contact information if an actual email or phone number is present (NEVER nav links)
  const emailMatch = allText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)
  const phoneMatch = allText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/)
  if (emailMatch || phoneMatch) {
    const parts = [
      emailMatch ? `Email: ${emailMatch[0]}` : '',
      phoneMatch && !emailMatch?.[0]?.includes(phoneMatch[0]) ? `Phone: ${phoneMatch[0]}` : '',
    ].filter(Boolean)
    if (parts.length > 0) {
      candidates.push({
        category: 'company_fact',
        title: 'Contact information',
        summary: parts.join(' | '),
        properties: {},
        source_url: pages.find((p) => /contact/i.test(p.url))?.url ?? base.origin,
        confidence: 0.9,
      })
    }
  }

  const credMatch = allText.match(/(?:credited by|certified|accredited|partner(?:ed)? with|powered by)[^\n.]{0,140}/i)
  if (credMatch) {
    candidates.push({
      category: 'company_fact',
      title: 'Credentials & partnerships',
      summary: credMatch[0].slice(0, 280),
      properties: {},
      source_url: pages[0]?.url ?? base.origin,
      confidence: 0.8,
    })
  }

  const faqPage = pages.find((p) => /faq|frequently/i.test(p.url))
  if (faqPage) {
    candidates.push({
      category: 'company_fact',
      title: 'FAQ page available',
      summary: toPlainText(faqPage.markdown).slice(0, 280),
      properties: {},
      source_url: faqPage.url,
      confidence: 0.7,
    })
  }

  return dedupe(candidates)
}

function dedupe(candidates: ExtractedCandidate[]): ExtractedCandidate[] {
  const seen = new Set<string>()
  const out: ExtractedCandidate[] = []
  for (const c of candidates) {
    const key = `${c.category}:${c.title.toLowerCase().replace(/\s+/g, ' ').trim()}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(c)
    }
  }
  return out.slice(0, 20)
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * End-to-end function to crawl a website, analyze and structure knowledge with AI,
 * delete previous messy crawler nodes, and insert clean approved nodes and relations.
 */
export async function organizeBrainWithAi(
  websiteUrl: string,
  workspaceId: string,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; nodesCount: number; edgesCount: number; error?: string }> {
  try {
    onProgress?.('Fetching website pages...')
    const crawlResult = await extractKnowledgeFromSite(websiteUrl, (read, total) => {
      onProgress?.(`Reading website content (${read}/${total} pages)...`)
    })

    if (!crawlResult.pages || crawlResult.pages.length === 0) {
      return { success: false, nodesCount: 0, edgesCount: 0, error: 'Could not fetch website content.' }
    }

    onProgress?.('AI is structuring business knowledge, offerings, and audience...')
    let candidates = await aiExtractKnowledge(crawlResult.pages)

    if (candidates.length === 0) {
      // Clean heuristic fallback if AI extraction fails
      candidates = crawlResult.candidates
    }

    if (candidates.length === 0) {
      return { success: false, nodesCount: 0, edgesCount: 0, error: 'No business knowledge could be extracted.' }
    }

    onProgress?.('Updating Business Brain...')

    // Remove old crawler-sourced nodes for this workspace to eliminate junk
    await supabase
      .from('brain_nodes')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('source', 'crawler')

    // Remove old edges for this workspace
    await supabase
      .from('brain_edges')
      .delete()
      .eq('workspace_id', workspaceId)

    // Insert clean approved nodes
    const rows = candidates.map((c) => ({
      workspace_id: workspaceId,
      category: c.category,
      title: c.title,
      summary: c.summary,
      properties: c.properties,
      status: 'approved' as const,
      source: 'crawler' as const,
      source_detail: c.source_url,
      confidence: c.confidence,
    }))

    const { data: insertedNodes, error: insertError } = await supabase
      .from('brain_nodes')
      .insert(rows)
      .select('id, category, title')

    if (insertError) {
      console.error('Failed to insert brain nodes:', insertError)
      return { success: false, nodesCount: 0, edgesCount: 0, error: insertError.message }
    }

    let edgeCount = 0
    if (insertedNodes && insertedNodes.length >= 2) {
      onProgress?.('Mapping relationships in Business Brain...')
      const relations = await aiExtractRelations(
        insertedNodes.map((n) => ({ category: n.category as BrainCategory, title: n.title }))
      )
      const byTitle = new Map(insertedNodes.map((n) => [n.title.toLowerCase(), n.id]))
      const edgeRows = relations
        .map((r) => ({
          workspace_id: workspaceId,
          source_node_id: byTitle.get(r.source_title.toLowerCase()),
          target_node_id: byTitle.get(r.target_title.toLowerCase()),
          relation_type: r.relation_type,
          status: 'approved' as const,
          weight: r.confidence,
        }))
        .filter(
          (e): e is typeof e & { source_node_id: string; target_node_id: string } =>
            Boolean(e.source_node_id) &&
            Boolean(e.target_node_id) &&
            e.source_node_id !== e.target_node_id
        )

      if (edgeRows.length > 0) {
        await supabase.from('brain_edges').insert(edgeRows)
        edgeCount = edgeRows.length
      }
    }

    // Update workspace settings
    await supabase
      .from('workspace_settings')
      .update({ company_url: websiteUrl, onboarding_state: 'completed' })
      .eq('workspace_id', workspaceId)

    // Audit log
    await supabase.from('audit_log').insert({
      workspace_id: workspaceId,
      action: 'brain_reorganized_with_ai',
      entity_type: 'brain_nodes',
      details: { count: candidates.length, edges: edgeCount, url: websiteUrl },
    })

    return { success: true, nodesCount: candidates.length, edgesCount: edgeCount }
  } catch (err) {
    console.error('Failed in organizeBrainWithAi:', err)
    return {
      success: false,
      nodesCount: 0,
      edgesCount: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
