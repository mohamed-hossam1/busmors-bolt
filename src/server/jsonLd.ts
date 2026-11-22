import type { BrainCategory } from '../lib/types'
import type { ExtractedCandidate } from '../lib/crawlContent'
import { cleanTitle, truncateWords, sanitizeEvidence } from '../lib/crawlContent'

export interface StructuredSiteData {
  companyName?: string
  description?: string
  telephone?: string
  email?: string
  address?: string
  socialLinks: string[]
  products: {
    name: string
    description?: string
    price?: number | string
    currency?: string
    availability?: string
    url?: string
  }[]
  faqs: {
    question: string
    answer: string
  }[]
  rawObjects: Record<string, unknown>[]
}

/** Extracts and safely parses all JSON-LD blocks from HTML content. */
export function extractJsonLdBlocks(html: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  const regex = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object') blocks.push(item as Record<string, unknown>)
        }
      } else if (parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>
        if (Array.isArray(obj['@graph'])) {
          for (const item of obj['@graph']) {
            if (item && typeof item === 'object') blocks.push(item as Record<string, unknown>)
          }
        } else {
          blocks.push(obj)
        }
      }
    } catch {
      // Ignore malformed JSON-LD scripts on third-party sites
    }
  }
  return blocks
}

function parsePrice(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''))
    if (!isNaN(num) && Number.isFinite(num)) return num
  }
  return undefined
}

/** Parses raw Schema.org objects into structured company and product facts. */
export function parseSchemaObjects(objects: Record<string, unknown>[], sourceUrl: string): StructuredSiteData {
  const data: StructuredSiteData = {
    socialLinks: [],
    products: [],
    faqs: [],
    rawObjects: objects,
  }

  for (const obj of objects) {
    const rawType = obj['@type']
    const types = Array.isArray(rawType) ? rawType.map(String) : [String(rawType || '')]
    const hasType = (...names: string[]) => types.some((t) => names.some((n) => t.toLowerCase().includes(n.toLowerCase())))

    // 1. Organization / Business Entity
    if (hasType('Organization', 'LocalBusiness', 'Store', 'Restaurant', 'Cafe', 'Corporation', 'MedicalBusiness')) {
      if (typeof obj.name === 'string' && !data.companyName) {
        data.companyName = cleanTitle(obj.name)
      }
      if (typeof obj.description === 'string' && !data.description) {
        data.description = obj.description.trim()
      }
      if (typeof obj.telephone === 'string' && !data.telephone) {
        data.telephone = obj.telephone.trim()
      }
      if (typeof obj.email === 'string' && !data.email) {
        data.email = obj.email.trim()
      }
      if (obj.address) {
        if (typeof obj.address === 'string') {
          data.address = obj.address.trim()
        } else if (typeof obj.address === 'object' && obj.address !== null) {
          const addr = obj.address as Record<string, unknown>
          const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean)
          if (parts.length) data.address = parts.map(String).join(', ')
        }
      }
      if (Array.isArray(obj.sameAs)) {
        for (const link of obj.sameAs) {
          if (typeof link === 'string' && /^https?:\/\//i.test(link)) {
            data.socialLinks.push(link)
          }
        }
      }
    }

    // 2. Products and Offerings
    if (hasType('Product', 'IndividualProduct')) {
      const name = typeof obj.name === 'string' ? obj.name.trim() : ''
      if (name) {
        let price: number | undefined
        let currency: string | undefined
        let availability: string | undefined

        const offers = obj.offers
        if (offers && typeof offers === 'object') {
          const offerObj = Array.isArray(offers) ? offers[0] : offers
          if (offerObj && typeof offerObj === 'object') {
            const rawOffer = offerObj as Record<string, unknown>
            price = parsePrice(rawOffer.price ?? rawOffer.lowPrice)
            if (typeof rawOffer.priceCurrency === 'string') currency = rawOffer.priceCurrency.trim()
            if (typeof rawOffer.availability === 'string') {
              availability = rawOffer.availability.replace(/^https?:\/\/schema\.org\//i, '')
            }
          }
        }

        data.products.push({
          name: cleanTitle(name),
          description: typeof obj.description === 'string' ? obj.description.trim() : undefined,
          price,
          currency,
          availability,
          url: typeof obj.url === 'string' ? obj.url : sourceUrl,
        })
      }
    }

    // 3. FAQPage
    if (hasType('FAQPage') && Array.isArray(obj.mainEntity)) {
      for (const item of obj.mainEntity) {
        if (item && typeof item === 'object') {
          const qObj = item as Record<string, unknown>
          const question = typeof qObj.name === 'string' ? qObj.name.trim() : ''
          const answerObj = qObj.acceptedAnswer as Record<string, unknown> | undefined
          const answer = typeof answerObj?.text === 'string' ? answerObj.text.replace(/<[^>]+>/g, ' ').trim() : ''
          if (question && answer) {
            data.faqs.push({ question, answer })
          }
        }
      }
    }
  }

  // Deduplicate social links
  data.socialLinks = [...new Set(data.socialLinks)]
  return data
}

/**
 * Converts structured Schema.org data into grounded Brain knowledge candidates.
 * Each item has a high confidence score and verifiable source evidence.
 */
export function schemaToBrainCandidates(data: StructuredSiteData, sourceUrl: string): ExtractedCandidate[] {
  const candidates: ExtractedCandidate[] = []

  const add = (category: BrainCategory, title: string, summary: string, quote: string, properties: Record<string, unknown> = {}) => {
    const cleanQuote = truncateWords(sanitizeEvidence(quote), 500)
    if (cleanQuote.length < 15) return
    candidates.push({
      category,
      title: cleanTitle(title),
      summary: truncateWords(sanitizeEvidence(summary), 280),
      source_url: sourceUrl,
      confidence: 0.95,
      properties: {
        extracted_by: 'json_ld',
        evidence_quote: cleanQuote,
        ...properties,
      },
    })
  }

  // Company Profile
  if (data.companyName && data.description) {
    const quote = `${data.companyName}: ${data.description}`
    add('company_profile', data.companyName, data.description, quote, {
      source: 'Schema.org Organization',
    })
  }

  // Offerings (Products / Services)
  for (const product of data.products.slice(0, 15)) {
    const priceStr = product.price !== undefined ? `${product.price} ${product.currency || ''}`.trim() : ''
    const summaryParts = [product.description, priceStr ? `Price: ${priceStr}` : ''].filter(Boolean)
    const summary = summaryParts.join(' — ') || product.name
    const quote = `${product.name} ${priceStr ? `— ${priceStr}` : ''}${product.description ? `\n${product.description}` : ''}`
    add('offering', product.name, summary, quote, {
      price: product.price,
      currency: product.currency,
      availability: product.availability,
      product_url: product.url,
    })
  }

  // Company Facts (Contact & Location)
  if (data.telephone) {
    add('company_fact', 'Official Telephone', `Customer contact phone: ${data.telephone}`, `Telephone: ${data.telephone}`, {
      phone: data.telephone,
    })
  }
  if (data.email) {
    add('company_fact', 'Official Email', `Customer support email: ${data.email}`, `Email: ${data.email}`, {
      email: data.email,
    })
  }
  if (data.address) {
    add('company_fact', 'Business Location', `Headquarters/Store location: ${data.address}`, `Address: ${data.address}`, {
      address: data.address,
    })
  }

  // Channels (Social Media)
  if (data.socialLinks.length > 0) {
    const channelNames = data.socialLinks.map((url) => {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, '')
        return domain.split('.')[0]
      } catch {
        return url
      }
    })
    const summary = `Official social channels: ${data.socialLinks.join(', ')}`
    add('channel', 'Social Media Presence', summary, summary, {
      channels: channelNames,
      links: data.socialLinks,
    })
  }

  // Audience Insights (from FAQs)
  for (const faq of data.faqs.slice(0, 5)) {
    add('audience', faq.question, faq.answer, `Q: ${faq.question}\nA: ${faq.answer}`, {
      faq_source: true,
    })
  }

  return candidates
}

/**
 * Probes the target URL for Schema.org JSON-LD scripts and parses them into grounded Brain candidates.
 */
export async function fetchSiteJsonLd(url: string, signal?: AbortSignal, timeoutMs = 4000): Promise<ExtractedCandidate[]> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BusMoraBot/1.0; +https://busmora.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: combinedSignal,
      cache: 'no-store',
    })
    clearTimeout(timer)
    if (!response.ok) return []
    const html = await response.text()
    const blocks = extractJsonLdBlocks(html)
    if (!blocks.length) return []
    const parsed = parseSchemaObjects(blocks, url)
    return schemaToBrainCandidates(parsed, url)
  } catch {
    return []
  }
}
