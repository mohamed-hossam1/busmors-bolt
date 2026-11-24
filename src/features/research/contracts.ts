// Shared language for the Egyptian-first marketing research pipeline.
// Every ticket builds on these contracts; no provider detail leaks into them.

export const MARKETING_RESEARCH_INTENT = 'marketing_research' as const

export type ResearchMode = 'quick' | 'standard' | 'deep'
export const RESEARCH_MODES: readonly ResearchMode[] = ['quick', 'standard', 'deep']

export type ResearchLanguage = 'ar-EG' | 'en'
export type SourceAvailability = 'retrieved' | 'partial' | 'blocked' | 'unavailable'
export type StoragePolicy = 'ephemeral' | 'excerpt' | 'workspace'
export type ProviderName = 'firecrawl' | 'tavily' | 'exa' | 'egypt_official' | 'osm' | 'composio'
export type Confidence = 'hypothesis' | 'supported' | 'validated' | 'strong'
export type ClaimQualityCoverage = 'full' | 'partial' | 'none'
export type ResearchTrack =
  | 'market_demand'
  | 'competitor_commercial'
  | 'customer_audience'
  | 'brand_positioning'
  | 'benchmark_strategy'

export type AgentRole = 'director' | 'subagent' | 'tool' | 'skill' | 'auditor' | 'synthesis'
export type AgentNodeState = 'queued' | 'running' | 'completed' | 'partial' | 'failed'
export type AgentEventType =
  | 'agent_started'
  | 'agent_completed'
  | 'agent_error'
  | 'tool_call'
  | 'skill_read'
  | 'delegation'
  | 'flow_connection'

export interface UsageRecord {
  calls: number
  pages: number
  tokens: number
  credits: number
}

/** One inspectable retrieval result. A blocked page is stored as a source, never as content. */
export interface SourceRecord {
  id: string
  url: string
  canonicalUrl: string
  title: string
  sourceType: string
  provider: ProviderName
  /** The discovery provider that surfaced this page, when it was not opened directly. */
  discoveredBy: ProviderName | null
  toolAction: string
  toolkitVersion: string
  capturedAt: string
  publishedAt: string | null
  excerpt: string
  contentHash: string
  availability: SourceAvailability
  storagePolicy: StoragePolicy
  usage: UsageRecord
  credits: number
  market: string | null
  sector: string | null
  authority: string | null
  authorityScore: number
  geography: string | null
  period: string | null
  blockedReason: string | null
}

/** A single observed fact tied to one source. Discovery results are never evidence. */
export interface EvidenceObservation {
  id: string
  kind: 'observation' | 'price' | 'quote' | 'profile' | 'demand_signal' | 'absence'
  sourceId: string
  sourceUrl: string
  quote: string
  quoteLanguage: ResearchLanguage | 'mixed'
  translation: string | null
  observedAt: string
  geography: string | null
  period: string | null
  directness: 'direct' | 'derived' | 'context'
  storagePolicy: StoragePolicy
}

/** Authority / directness / Egyptian relevance / recency / corroboration, with reasons. */
export interface ClaimQuality {
  authority: number
  directness: number
  relevance: number
  recency: number
  corroboration: number
  score: number
  coverage: ClaimQualityCoverage
  reasons: string[]
}

export interface ResearchClaim {
  id: string
  statement: string
  statementAr: string | null
  kind: string
  confidence: Confidence
  evidenceIds: string[]
  sourceIds: string[]
  geography: string | null
  validFrom: string | null
  validUntil: string | null
  claimQuality: ClaimQuality
  conflicts: string[]
  reportId: string | null
}

/** The Canvas renders only these events; refresh reconstructs the same sequence. */
export interface VisibleAgentEvent {
  id: string
  instanceId: string
  correlationId: string
  parentInstanceId: string | null
  seq: number
  type: AgentEventType
  agentId: string
  agentRole: AgentRole
  label: string
  status: AgentNodeState
  publicMessage: string
  parametersRedacted: Record<string, unknown>
  sourceIds: string[]
  consumption: UsageRecord
  startedAt: string | null
  endedAt: string | null
  failureReason: string | null
}

export interface ResearchBudget {
  calls: number
  pages: number
  tokens: number
  seconds: number
  credits: number
}

export interface BusinessProfile {
  name: string
  sector: string
  description: string
  governorates: string[]
  channels: string[]
  website: string | null
  audience: string
  offerings?: string[]
}

export interface GeographyScope {
  label: string
  governorates: string[]
  egyptWide: boolean
}

export interface StopRule {
  maxQueryRounds: number
  minNewEntityPercent: number
  entityTarget: number
}

export interface ResearchBrief {
  id: string
  mode: ResearchMode
  request: string
  businessProfile: BusinessProfile
  category: {
    label: string
    labelAr: string
    subcategories: string[]
    substitutes: string[]
    doNothing: string
  }
  queryLanguages: ResearchLanguage[]
  geography: GeographyScope
  tracks: ResearchTrack[]
  budget: ResearchBudget
  stopRules: StopRule
  createdAt: string
  aiQueries?: string[]
  knownCompetitors?: string[]
}

const LANGUAGES: readonly ResearchLanguage[] = ['ar-EG', 'en']

/** Arabizi numerals or known Egyptian transliterations. */
const ARABIZI_HINT = /(?:[a-z]+[2357][a-z0-9]*)|(?:\b(?:bekam|azl|tawseel|dafe3|tsle7|sramic|mawsimeya)\b)/i
function looksArabizi(text: string): boolean {
  return ARABIZI_HINT.test(text)
}

export function isResearchMode(value: unknown): value is ResearchMode {
  return typeof value === 'string' && (RESEARCH_MODES as readonly string[]).includes(value)
}

/** Bilingual ordering rule: Arabic-first for Arabic/Egyptian/Arabizi queries. */
export function queryLanguageOrder(text: string): ResearchLanguage[] {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  // Arabizi is Egyptian Arabic written in Latin letters, so it orders like Arabic.
  if (arabic === 0 && looksArabizi(text)) return [...LANGUAGES]
  if (arabic === 0) return [...LANGUAGES].reverse() as ResearchLanguage[]
  if (arabic >= latin / 3) return [...LANGUAGES]
  return [...LANGUAGES].reverse() as ResearchLanguage[]
}

export function emptyUsage(): UsageRecord {
  return { calls: 0, pages: 0, tokens: 0, credits: 0 }
}

/** Accumulate provider usage into a running total (mutates and returns `target`). */
export function addUsage(target: UsageRecord, addition: Partial<UsageRecord>): UsageRecord {
  target.calls += addition.calls ?? 0
  target.pages += addition.pages ?? 0
  target.tokens += addition.tokens ?? 0
  target.credits += addition.credits ?? 0
  return target
}
export interface ResearchRunInput {
  taskId: string
  runId: string
  conversationId: string
  request: string
  mode: ResearchMode
  signal: AbortSignal
}

export interface PdfCheck {
  name: string
  passed: boolean
  detail: string
}

export interface PdfArtifact {
  path: string
  pageCount: number
  metadata: Record<string, string>
  checks: PdfCheck[]
  passed: boolean
}

export interface ResearchArtifacts {
  reportId: string
  mode: ResearchMode
  tracks: ResearchTrack[]
  sourceIds: string[]
  claimIds: string[]
  citationCoverage: number
  claimQuality: number
  coverageGaps: string[]
  budget: ResearchBudget
  consumption: UsageRecord
  blocked: number
  pdf: PdfArtifact | null
  reportJsonPath: string
  reportHtmlPath: string
  partial: boolean
}

export interface ResearchRunResult {
  reply: string
  partial: boolean
  document: { title: string; content: string; type: 'research_report' }
  research: ResearchArtifacts
}
