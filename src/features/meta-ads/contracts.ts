export type DatePreset = 'last_7d' | 'last_30d'
export const DATE_PRESETS: readonly DatePreset[] = ['last_7d', 'last_30d']
export type ResultKind = 'messages' | 'leads' | 'purchases' | 'clicks'
export type Health = 'good' | 'average' | 'poor' | 'unknown'
export type MetaAdsErrorCode = 'auth_expired' | 'permission_denied' | 'invalid_request' | 'provider_error'
export type RawRow = Record<string, unknown>

export interface AdAccount { id: string; name: string; currency: string; timezoneName: string; active: boolean }
export interface InsightsQuery { adAccountId: string; level: 'account' | 'ad'; datePreset: DatePreset; daily: boolean; fields: readonly string[] }
export type TransportResult<T> = { ok: true; value: T } | { ok: false; code: MetaAdsErrorCode }

/** Read-only data access. Implementations never throw. */
export interface MetaAdsTransport {
  listAdAccounts(workspaceId: string, connectionRef: string): Promise<TransportResult<AdAccount[]>>
  getInsights(workspaceId: string, connectionRef: string, query: InsightsQuery): Promise<TransportResult<RawRow[]>>
}

export interface KpiSummary { spend: number; impressions: number; reach: number; frequency: number; clicks: number; ctr: number | null; cpc: number | null; cpm: number | null; results: number; resultKind: ResultKind; costPerResult: number | null }
export interface DailyPoint { date: string; spend: number; impressions: number; clicks: number; results: number }
export interface VideoCurvePoint { second: number; label: string; percent: number }
export interface AdRow { adId: string; adName: string; campaignName: string; objective: string | null; spend: number; impressions: number; clicks: number; ctr: number | null; results: number; resultKind: ResultKind; costPerResult: number | null; hookRate: number | null; holdRate: number | null; videoCurve: VideoCurvePoint[] | null; health: Health }
export interface AdsReport { schemaVersion: 1; adAccountId: string; currency: string; timezoneName: string; datePreset: DatePreset; generatedAt: string; summary: KpiSummary; daily: DailyPoint[]; ads: AdRow[] }

export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : 0
}