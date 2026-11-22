import type { ProviderName, SourceRecord, UsageRecord } from '../contracts'
import type { CandidateUrl } from './normalize'

export type ProviderErrorCode =
  | 'insufficient_allowance'
  | 'blocked'
  | 'unavailable'
  | 'invalid_key'
  | 'no_active_key'
  | 'rate_limited'
  | 'network_error'
  | 'not_configured'
  | 'payment_required'
  | 'provider_error'

export interface ProviderEstimate {
  calls: number
  pages: number
  tokens: number
  credits: number
}

export interface ProviderContext {
  taskId: string
  callId: string
  signal: AbortSignal
}

/** Every outcome carries what was captured: a blocked page is still a source row. */
export interface ProviderBase {
  sources: SourceRecord[]
  candidates: CandidateUrl[]
  usage: UsageRecord
  notes: string[]
}

export interface ProviderSuccess extends ProviderBase {
  ok: true
}

export interface ProviderFailure extends ProviderBase {
  ok: false
  code: ProviderErrorCode
  message: string
}

export type ProviderOutcome = ProviderSuccess | ProviderFailure

/** Every provider implements estimate → reserve → execute → normalize → record. */
export interface ProviderAdapter<Input = unknown> {
  name: ProviderName
  version: string
  needsKey: boolean
  estimate(input: Input): ProviderEstimate
  execute(input: Input, context: ProviderContext): Promise<ProviderOutcome>
}

export interface SearchHit {
  url: string
  title: string
  snippet: string
  score?: number
  publishedAt?: string | null
}

export interface SearchTransport {
  search(query: string, options: { maxResults: number; signal: AbortSignal }): Promise<{ ok: true; hits: SearchHit[] } | { ok: false; code: ProviderErrorCode; message: string }>
}

export interface ScrapeTransport {
  scrape(url: string, options: { signal: AbortSignal }): Promise<
    | { ok: true; title: string; markdown: string; publishedAt: string | null }
    | { ok: false; code: ProviderErrorCode; message: string }
  >
}

export interface MapTransport {
  nearby(query: string, options: { signal: AbortSignal }): Promise<
    | { ok: true; places: { name: string; lat: number; lon: number; kind: string; address: string }[] }
    | { ok: false; code: ProviderErrorCode; message: string }
  >
}

export interface ComposioTransport {
  run(action: string, options: { signal: AbortSignal; params: Record<string, unknown> }): Promise<
    | { ok: true; data: Record<string, unknown>; chargedCredits?: number }
    | { ok: false; code: ProviderErrorCode; message: string; paymentRequired?: boolean; chargedCredits?: number }
  >
  instantPrice?(action: string): Promise<{ ok: true; credits: number; paymentRequired: boolean } | { ok: false; message: string }>
}

export interface OfficialTransport {
  fetchPage(url: string, options: { signal: AbortSignal }): Promise<
    | { ok: true; title: string; markdown: string; publishedAt: string | null; issuer: string; period: string | null; geography: string | null }
    | { ok: false; code: ProviderErrorCode; message: string }
  >
}