import type { BrainCategory } from './types'

export interface CrawledPage {
  url: string
  markdown: string
  title?: string
}

export interface ExtractedCandidate {
  category: BrainCategory
  title: string
  summary: string
  properties: Record<string, unknown>
  source_url: string
  confidence: number
  verification_state?: 'unverified' | 'source_supported' | 'contradicted' | 'owner_reported'
}

export function truncateWords(text: string, max: number): string {
  const value = text.trim()
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const boundary = cut.lastIndexOf(' ')
  return (boundary > max / 2 ? cut.slice(0, boundary) : cut).trim()
}

export function cleanTitle(title: string): string {
  return truncateWords(title.replace(/^[-–—#*:\s]+|[-–—#*:\s]+$/g, ''), 60)
}

export function cleanCrawlText(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^(URL Source|Markdown Content):/gim, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanPageForAi(markdown: string): string {
  const seen = new Set<string>()
  // Navigation can contain H3 headings before the actual H1. Drop that preamble only if near top.
  const firstTitle = markdown.search(/^#\s+\S/m)
  const content = firstTitle >= 0 && firstTitle < markdown.length * 0.2 ? markdown.slice(firstTitle) : markdown
  const sections = content.split(/(?=^#{1,6}\s)/m)
  const filtered = sections.length > 1
    ? sections.filter((section) => {
        const lines = section.split('\n').filter((line) => line.trim() && !/^#{1,6}\s/.test(line) && !/^\s*!\[/.test(line))
        const prose = lines.filter((line) => !/^\s*(?:[-*]\s*)?\[[^\]]*\]\([^)]*\)(?:\s*\[[^\]]*\]\([^)]*\))*\s*$/.test(line))
        return !lines.length || prose.join(' ').length >= 25
      }).join('\n')
    : content
  return filtered
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1 ')
    .replace(/https?:\/\/[^\s)]+/g, '')
    .split('\n')
    .filter((line) => {
      const key = line.trim().replace(/\s+/g, ' ').toLowerCase()
      if (!key) return true
      if (/^[-*]?\s*(home|menu|navigation|footer|log ?in|sign ?up)\s*$/i.test(key)) return false
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function toPlainText(markdown: string): string {
  return markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1 ')
    .replace(/[#*_>`~|]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Strips markdown/link syntax that survives slicing (e.g. a truncated `[..](mailto:`),
 * so stored evidence reads as clean prose instead of raw markup. */
export function sanitizeEvidence(text: string): string {
  const cleaned = text
    .replace(/!\[[^\]]*\]\([^)]*\)?/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)?/g, '$1 ')
    .replace(/\]\([^)]*\)?/g, ' ')
    .replace(/[[\]]/g, ' ')
  return toPlainText(cleaned).replace(/\b(?:mailto|tel):/gi, '').replace(/\s+/g, ' ').trim()
}

export function normalizedEvidence(text: string): string {
  return toPlainText(text).normalize('NFKC').toLowerCase()
}

export function splitSections(markdown: string): { heading: string; body: string; context: string }[] {
  const sections: { heading: string; body: string; context: string }[] = []
  let heading = ''
  let context = ''
  const parents: { depth: number; heading: string }[] = []
  let body: string[] = []
  const flush = () => {
    const text = body.join('\n').trim()
    if (heading || toPlainText(text).length > 0) sections.push({ heading, body: text, context })
  }
  const lines = markdown.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^(#{1,6})\s+(.*)$/)
    const underline = !match && line.trim() && /^\s*(?:={3,}|-{3,})\s*$/.test(lines[i + 1] || '')
    if (match || underline) {
      flush()
      const depth = match ? match[1].length : lines[i + 1].trim().startsWith('=') ? 1 : 2
      while (parents.length && parents[parents.length - 1].depth >= depth) parents.pop()
      context = parents.map((parent) => parent.heading).join(' / ')
      heading = toPlainText(match ? match[2] : line)
      parents.push({ depth, heading })
      if (underline) i++
      body = []
    } else body.push(line)
  }
  flush()
  return sections
}

// Every page receives a budget; useful later sections can displace boilerplate.
export function buildPageBlocks(pages: CrawledPage[], totalBudget = 32000): { text: string; excerpts: Map<string, string> } {
  const excerpts = new Map<string, string>()
  const budget = Math.floor(totalBudget / Math.max(1, pages.length))
  const blocks = pages.map((page, index) => {
    const cleanedSections = splitSections(cleanPageForAi(page.markdown))
    const firstContent = cleanedSections.findIndex((section) => section.body.length > 80)
    const sections = cleanedSections
      .map((section, order) => ({ ...section, order, score: (order === firstContent ? 5 : 0) +
        (/product|service|pricing|audien|customer|mission|feature/i.test(section.heading + ' ' + section.context) ? 5 : 0) }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
    let remaining = budget
    const sectionLimit = Math.max(1800, Math.floor(budget / Math.max(1, Math.min(sections.length, 4))))
    const chosen: { order: number; text: string }[] = []
    for (const section of sections) {
      if (remaining < 100) break
      const text = truncateWords(`${section.context ? section.context + ' / ' : ''}${section.heading}\n${section.body}`, Math.min(remaining, sectionLimit))
      chosen.push({ order: section.order, text })
      remaining -= text.length + 2
    }
    const excerpt = chosen.sort((a, b) => a.order - b.order).map((s) => s.text).join('\n\n')
    const id = `p${index + 1}`
    excerpts.set(id, excerpt)
    return `=== PAGE ${id}: ${page.url} ===\n${excerpt}`
  })
  return { text: blocks.join('\n\n'), excerpts }
}

export function dedupeCandidates(candidates: ExtractedCandidate[]): ExtractedCandidate[] {
  const unique = new Map<string, ExtractedCandidate>()
  const summaries = new Set<string>()
  for (const candidate of [...candidates].sort((a, b) => b.confidence - a.confidence)) {
    const key = `${candidate.category}:${normalizedEvidence(candidate.title)}`
    const summaryKey = `${candidate.category}:${normalizedEvidence(candidate.summary)}`
    if (candidate.title.length < 2 || candidate.summary.length < 20 || unique.has(key) || summaries.has(summaryKey)) continue
    unique.set(key, candidate)
    summaries.add(summaryKey)
  }
  // Round-robin categories so pricing and company values cannot crowd out products.
  const groups = new Map<BrainCategory, ExtractedCandidate[]>()
  for (const item of unique.values()) groups.set(item.category, [...(groups.get(item.category) || []), item])
  const selected: ExtractedCandidate[] = []
  while (selected.length < 20 && [...groups.values()].some((items) => items.length)) {
    for (const items of groups.values()) {
      if (items.length && selected.length < 20) selected.push(items.shift()!)
    }
  }
  return selected
}

/** Structured, source-backed fallback. Its suggestions remain reviewable. */
export function extractCandidates(baseUrl: string, pages: CrawledPage[]): ExtractedCandidate[] {
  const candidates: ExtractedCandidate[] = []
  const home = pages[0]
  const rawTitle = home?.title?.split(/\s[-–—|]\s|:\s/)[0] || ''
  // A product/price title (e.g. "250g of Coffee ... LE 480.00") is not a company
  // name; fall back to the hostname brand instead of storing the broken string.
  const titleLooksLikeProduct = /(?:\bEGP\b|\bLE\b|[$€£]|\d+\s*(?:g|kg|ml)\b|LE\s*[\d,])/i.test(rawTitle) || /\d{3,}/.test(rawTitle)
  const fallbackBrand = new URL(baseUrl).hostname.replace(/^www\./, '').split('.')[0]
  const company = cleanTitle(!titleLooksLikeProduct && rawTitle ? rawTitle : fallbackBrand)
  const badHeading = /best time to post|\b20\d{2}\b|\b(?:guide|tips|strategies)\b|^(?:frequently|faq|resources|apps\s*&|navigation|cookie|privacy)/i
  const meaningful = (text: string) => text.length >= 35 && text.split(/\s+/).length >= 6 &&
    !/^(?:get started|start your|learn more|enter your|by entering|sign up|log in|navigation|what.s included)/i.test(text)
  const paragraphs = (body: string) => body.split(/\n\s*\n/).map(toPlainText).filter(meaningful)
  const add = (category: BrainCategory, title: string, evidence: string, page: CrawledPage, details = evidence) => {
    const quote = truncateWords(sanitizeEvidence(evidence), 500)
    if (quote.length < 25) return
    candidates.push({ category, title: cleanTitle(title), summary: truncateWords(sanitizeEvidence(evidence), 280),
      source_url: page.url, confidence: 0.65,
      properties: { extracted_by: 'heuristic', evidence_quote: quote, details: truncateWords(sanitizeEvidence(details), 1600) } })
  }
  if (home) {
    const sections = splitSections(cleanPageForAi(home.markdown))
    const hero = sections.find((section) => section.heading && !badHeading.test(section.heading) && paragraphs(section.body).length) || sections.find((section) => paragraphs(section.body).length)
    const description = hero && (paragraphs(hero.body).find((text) => /helps?|provides?|platform|software|create|manage/i.test(text)) || paragraphs(hero.body)[0])
    if (description) add('company_profile', company, /^works with/i.test(description) ? `${hero.heading}\n\n${description}` : description, home, `${hero.heading}\n${hero.body}`)
  }
  const audienceTerms: [string, RegExp][] = [
    ['Creators', /\bcreators?\b/i], ['Brands', /\bbrands?\b/i], ['Agencies', /\bagenc(?:y|ies)\b/i],
    ['Small businesses', /\bsmall business(?:es)?\b/i], ['Startups', /\bstartups?\b/i],
    ['Enterprises', /\benterprises?\b/i], ['Teams', /\bteams?\b/i],
    ['Business owners', /\bbusiness owners?\b/i], ['Nonprofits', /nonprofits?/i],
    ['Developers', /\bdevelopers?\b/i], ['Schools & universities', /schools|universities|higher education/i],
  ]
  const platforms = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'Threads', 'Bluesky', 'YouTube', 'Pinterest', 'Google Business', 'Mastodon', 'Substack', 'Meta', 'Bing']
  for (const page of pages) {
    const cleaned = cleanPageForAi(page.markdown)
    const sections = splitSections(cleaned)
    const pricingPage = /pric|plans|packages/i.test(new URL(page.url).pathname)
    for (const section of sections) {
      const heading = section.heading
      const statements = paragraphs(section.body)
      const context = `${section.context} / ${heading}`
      const productContext = /features|products|services|solutions|capabilities/i.test(section.context) || /create|publish|insight|analytic|community|collaborat|product|service|solution|feature|platform|campaign|scanner|automat|integration|dashboard|clickfraud|assistant|mobile app|protect/i.test(heading)
      const functionalStatements = [...statements].sort((a, b) => Number(b.length >= 80) - Number(a.length >= 80))
      const productDescription = functionalStatements.find((text) => /creat|schedul|publish|manag|generat|automat|analy|report|connect|plan|organiz|protect|scan|reply|respond|provide|fine.tune|help/i.test(text) && !/total budget|fraudulent clicks|blocked ips|step \d/i.test(text))
      if (heading && !badHeading.test(heading) && productContext && productDescription && !/[?]$|^(one\b|your\b|powerful ads$|why\b|how\b|what\b|try\b|ready\b|get\b|not sure)/i.test(heading)) {
        const name = heading.split(/\s+/).length === 1 ? `${company} ${heading}` : heading
        add('offering', name, productDescription, page, `${heading}\n${section.body}`)
      }
      if (pricingPage && heading && !badHeading.test(heading) && /\$|€|£|free forever|per month|\/month|billed/i.test(section.body) && !/frequently|faq|why|how|what|support|included|customer|only pay|questions/i.test(heading) && /^(?:free|essentials?|team|pro|professional|business|enterprise|starter|basic|premium|growth|agency|standard|advanced)(?:\s+(?:plan|recommended))?$/i.test(heading)) {
        const pricing = toPlainText(section.body)
        if (pricing.length >= 25) add('company_fact', `${heading.replace(/\s+Recommended$/i, '')} pricing`, pricing, page, `${heading}\n${section.body}`)
      }
      if (/\b(?:mission|vision|purpose|our goal)\b/i.test(heading) && statements[0]) add('strategic_goal', heading, statements[0], page)
      if (/values|principles|brand voice|tone/i.test(context) && heading && statements[0] && !badHeading.test(heading) && !/^(?:our )?(?:values|principles)$/i.test(heading)) add('brand_rule', heading, statements[0], page)
      const texts = /[?]$/.test(heading) || /testimonial|our clients love/i.test(context) ? [] : [heading, ...statements].filter(Boolean)
      for (const text of texts) {
        if (text.length < 25) continue
        const segments = audienceTerms.filter(([, pattern]) => pattern.test(text)).map(([label]) => label)
        if (segments.length && !/our agency|our team|it.s like|personal team|media buyers|testimonial/i.test(text) && /built for|designed for|made for|using|used by|serves|whether you are|helps? (?:small businesses|creators|brands|agencies|teams|startups)|for (?:small businesses|creators|brands|agencies|teams|startups|enterprises|developers)/i.test(text)) add('audience', segments.slice(0, 3).join(', '), text.replace(/^[\d,]+\s+/, ''), page)
        if (/our (?:mission|vision|goal) is/i.test(text)) add('strategic_goal', 'Stated mission', text, page)
        if (/unlike|rather than traditional|only platform|differentiat/i.test(text)) add('positioning', 'Stated differentiation', text, page)
        if (/certified|accredited|premier partner|partner(?:ed)? with|powered by/i.test(text)) add('company_fact', 'Credentials & partnerships', text, page)
        const supported = platforms.filter((platform) => text.toLowerCase().includes(platform.toLowerCase()))
        if (supported.length >= 2 && /publish|schedule|post|support|advertis|across/i.test(text)) add('channel', 'Supported platforms', text, page, supported.join(', ') + '\n' + text)
      }
    }
    const text = sanitizeEvidence(cleaned)
    const email = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)
    if (email) {
      const index = text.indexOf(email[0])
      add('company_fact', /partner/i.test(email[0]) ? 'Partnership contact email' : 'Published contact email', text.slice(Math.max(0, index - 35), index + email[0].length + 65), page)
    }
    const phone = page.markdown.match(/\]\(tel:([^\s)]+)\)/i)?.[1]
    if (phone && phone.replace(/\D/g, '').length >= 8) {
      const index = text.indexOf(phone)
      const at = index >= 0 ? index : 0
      add('company_fact', 'Contact phone', text.slice(Math.max(0, at - 50), at + phone.length + 70), page)
    }
  }
  return dedupeCandidates(candidates)
}
