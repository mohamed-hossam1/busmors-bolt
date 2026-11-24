import type { AdsReport, DatePreset, ResultKind } from './contracts'
import { formatCount, formatMoney } from './format'

/** The minimal view shape the dashboard needs to decide whether to auto-sync on open. */
export interface AutoSyncView {
  state: 'disabled' | 'not_connected' | 'choose_account' | 'connected'
  isStale?: boolean
  lastError?: string | null
  report?: AdsReport | null
}

/** UI phase of the sync request that drives the status surface below the header. */
export interface SyncUiState {
  phase: 'idle' | 'syncing' | 'error' | 'skipped'
  code?: string
  retryAt?: string
}

export type SummaryKey =
  | 'adsSummaryMessages'
  | 'adsSummaryLeads'
  | 'adsSummaryPurchases'
  | 'adsSummaryClicks'
  | 'adsSummaryNoData'

export type ReportBanner = 'updating' | 'reconnect' | 'retry' | 'cooldown'

export type AdsReportStatus =
  | { kind: 'loading' }
  | { kind: 'reconnect' }
  | { kind: 'retry' }
  | { kind: 'cooldown'; retryAt?: string }
  | { kind: 'report'; banner: ReportBanner | null; retryAt?: string }

const SUMMARY_KEY: Record<ResultKind, SummaryKey> = {
  messages: 'adsSummaryMessages',
  leads: 'adsSummaryLeads',
  purchases: 'adsSummaryPurchases',
  clicks: 'adsSummaryClicks',
}

/** Maps the `?range=` query value to a date preset; anything other than `30d` is `last_7d`. */
export function rangeFromParam(param: string | string[] | undefined): DatePreset {
  const value = Array.isArray(param) ? param[0] : param
  return value === '30d' ? 'last_30d' : 'last_7d'
}

function bestAdName(report: AdsReport): string {
  const kind = report.summary.resultKind
  const matching = report.ads.filter((ad) => ad.resultKind === kind)
  const pool = matching.length > 0 ? matching : report.ads
  let best = pool[0]
  for (const ad of pool) {
    if (ad.results > best.results) best = ad
    else if (ad.results === best.results && ad.spend > best.spend) best = ad
  }
  return best.adName
}

/** The one-line Arabic/English summary sentence, as a dictionary key plus its values. */
export function summarySentence(report: AdsReport, locale: 'ar' | 'en'): { key: SummaryKey; values: Record<string, string> } {
  if (report.ads.length === 0) return { key: 'adsSummaryNoData', values: {} }
  return {
    key: SUMMARY_KEY[report.summary.resultKind],
    values: {
      spend: formatMoney(report.summary.spend, report.currency, locale),
      results: formatCount(report.summary.results),
      best: bestAdName(report),
    },
  }
}

/** True only for a connected, stale view whose last error is not an auth/permission failure. */
export function shouldAutoSync(view: AutoSyncView): boolean {
  if (view.state !== 'connected') return false
  if (!view.isStale) return false
  const error = view.lastError ?? null
  if (error === 'auth_expired' || error === 'permission_denied') return false
  return true
}

function withRetry<T extends { kind: string }>(base: T, retryAt: string | undefined): T & { retryAt?: string } {
  return retryAt === undefined ? base : { ...base, retryAt }
}

/** Decides what to render below the header from the cached report, the live sync and the last error. */
export function reportStatus(input: { hasReport: boolean; sync: SyncUiState; lastError: string | null }): AdsReportStatus {
  const { hasReport, sync, lastError } = input
  if (sync.phase === 'syncing') {
    return hasReport ? { kind: 'report', banner: 'updating' } : { kind: 'loading' }
  }
  if (sync.phase === 'error') {
    const auth = sync.code === 'auth_expired' || sync.code === 'permission_denied'
    const banner: ReportBanner = auth ? 'reconnect' : 'retry'
    return hasReport ? { kind: 'report', banner } : { kind: banner }
  }
  if (sync.phase === 'skipped') {
    return hasReport
      ? withRetry({ kind: 'report', banner: 'cooldown' }, sync.retryAt)
      : withRetry({ kind: 'cooldown' }, sync.retryAt)
  }
  // idle
  if (lastError === null) {
    return hasReport ? { kind: 'report', banner: null } : { kind: 'retry' }
  }
  const auth = lastError === 'auth_expired' || lastError === 'permission_denied'
  const banner: ReportBanner = auth ? 'reconnect' : 'retry'
  return hasReport ? { kind: 'report', banner } : { kind: banner }
}