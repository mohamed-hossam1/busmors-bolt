import type { ScrapeTransport, SearchTransport, MapTransport, ComposioTransport, OfficialTransport } from '../../../src/features/research/providers/types'

/** A scrape transport that returns a fixed page for any URL. */
export function fakeScrape(pages: Record<string, { title: string; markdown: string }> = {}, options: { blocked?: string[] } = {}): ScrapeTransport {
  return {
    async scrape(url) {
      if (options.blocked?.includes(url)) return { ok: false, code: 'blocked', message: '403 Forbidden' }
      const page = pages[url] ?? { title: `Page ${url}`, markdown: `A readable page about ceramic repair in Cairo. ${url}` }
      return { ok: true, title: page.title, markdown: page.markdown, publishedAt: '2026-10-01T00:00:00Z' }
    },
  }
}

export function fakeSearch(hits: { url: string; title: string; snippet: string }[]): SearchTransport {
  return {
    async search(query, options) {
      return { ok: true, hits: hits.slice(0, options.maxResults).map(hit => ({ ...hit, score: 0.9 })) }
    },
  }
}

export function fakeMap(places: { name: string; lat: number; lon: number; kind: string; address: string }[]): MapTransport {
  return { async nearby() { return { ok: true, places } } }
}

export function fakeOfficial(pages: Record<string, { title: string; markdown: string; issuer: string }>): OfficialTransport {
  return {
    async fetchPage(url) {
      const page = pages[url]
      if (!page) return { ok: false, code: 'unavailable', message: 'not found' }
      return { ok: true, title: page.title, markdown: page.markdown, publishedAt: '2026-09-15', issuer: page.issuer, period: '2026 Q2', geography: 'Egypt' }
    },
  }
}

export function fakeComposio(options: {
  data?: Record<string, unknown>
  paymentRequired?: boolean
  chargedCredits?: number
  price?: { ok: true; credits: number; paymentRequired: boolean } | { ok: false; message: string }
} = {}): ComposioTransport {
  return {
    async run() {
      if (options.paymentRequired) return { ok: false, code: 'payment_required', message: 'payment required', paymentRequired: true }
      return { ok: true, data: options.data ?? { data: [{ id: '1', url: 'https://facebook.com/post/1', text: 'الدفع عند الاستلام متاح؟', author: 'owner' }] }, chargedCredits: options.chargedCredits }
    },
    async instantPrice() {
      return options.price ?? { ok: false, message: 'no pricing endpoint' }
    },
  }
}

/** Minimal visible event capture for director/agent tests. */
export function capturingSink() {
  const events: unknown[] = []
  return {
    events,
    async append(event: Record<string, unknown>) {
      const stored = { ...event, id: `evt:${events.length}`, seq: events.length }
      events.push(stored)
      return stored as never
    },
  }
}