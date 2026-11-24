import 'server-only'
import { getIdentity } from '../auth'
import { isMetaAdsEnabled } from './provider'
import { DEFAULT_SYNC_CONFIG } from '../../features/meta-ads/freshness'
import type { AdsReport, DatePreset } from '../../features/meta-ads/contracts'

export type AdsReportView =
  | { state: 'disabled' }
  | { state: 'not_connected' }
  | { state: 'choose_account' }
  | {
      state: 'connected'
      account: { name: string; currency: string; timezoneName: string }
      preset: DatePreset
      report: AdsReport | null
      fetchedAt: string | null
      isStale: boolean
      lastError: string | null
    }

/**
 * Loads everything the ads page needs. Uses the user client so RLS applies, and selects
 * explicit columns only: `connection_ref` is never read, and `*` is never used.
 */
export async function loadAdsReportView(preset: DatePreset): Promise<AdsReportView> {
  if (!isMetaAdsEnabled()) return { state: 'disabled' }

  const identity = await getIdentity()
  if (!identity) return { state: 'not_connected' }
  const supabase = identity.supabase

  const { data, error } = await supabase
    .from('meta_ads_connections')
    .select('status, ad_account_name, currency, timezone_name, last_sync_error')
    .eq('workspace_id', identity.user.id)
    .maybeSingle()
  if (error || !data) return { state: 'not_connected' }

  const row = data as {
    status: 'pending_account' | 'connected' | 'disconnected'
    ad_account_name: string | null
    currency: string | null
    timezone_name: string | null
    last_sync_error: string | null
  }
  if (row.status === 'disconnected') return { state: 'not_connected' }
  if (row.status === 'pending_account') return { state: 'choose_account' }

  const { data: reportData } = await supabase
    .from('meta_ads_reports')
    .select('report, fetched_at')
    .eq('workspace_id', identity.user.id)
    .eq('date_preset', preset)
    .maybeSingle()
  const reportRow = reportData as { report: unknown; fetched_at: string | null } | null

  const fetchedAt = reportRow?.fetched_at ? new Date(reportRow.fetched_at) : null
  const isStale = !fetchedAt || Date.now() - fetchedAt.getTime() >= DEFAULT_SYNC_CONFIG.staleMs

  let report: AdsReport | null = null
  const candidate = reportRow?.report as AdsReport | undefined
  if (candidate && candidate.schemaVersion === 1 && Array.isArray(candidate.ads)) report = candidate

  return {
    state: 'connected',
    account: {
      name: row.ad_account_name ?? '',
      currency: row.currency ?? '',
      timezoneName: row.timezone_name ?? 'UTC',
    },
    preset,
    report,
    fetchedAt: fetchedAt ? fetchedAt.toISOString() : null,
    isStale,
    lastError: row.last_sync_error,
  }
}