import 'server-only'
import { createAdminClient } from '../supabase-admin'
import type { AdAccount, AdsReport, DatePreset, MetaAdsErrorCode } from '../../features/meta-ads/contracts'

export interface StoredConnection {
  connectionRef: string | null
  status: 'pending_account' | 'connected' | 'disconnected'
  adAccount: AdAccount | null
  lastManualSyncAt: Date | null
  lastSyncError: string | null
}

/** Loads the workspace's meta ads connection through the admin client (RLS bypassed). */
export async function loadConnection(workspaceId: string): Promise<StoredConnection | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('meta_ads_connections')
    .select('connection_ref, status, ad_account_id, ad_account_name, currency, timezone_name, last_manual_sync_at, last_sync_error')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as {
    connection_ref: string | null
    status: 'pending_account' | 'connected' | 'disconnected'
    ad_account_id: string | null
    ad_account_name: string | null
    currency: string | null
    timezone_name: string | null
    last_manual_sync_at: string | null
    last_sync_error: string | null
  }
  const adAccount: AdAccount | null =
    row.ad_account_id && row.currency && row.timezone_name
      ? { id: row.ad_account_id, name: row.ad_account_name ?? row.ad_account_id, currency: row.currency, timezoneName: row.timezone_name, active: true }
      : null
  return {
    connectionRef: row.connection_ref,
    status: row.status,
    adAccount,
    lastManualSyncAt: row.last_manual_sync_at ? new Date(row.last_manual_sync_at) : null,
    lastSyncError: row.last_sync_error,
  }
}

/** Loads the cached report for a preset, or null when it is missing or malformed. */
export async function loadReport(workspaceId: string, preset: DatePreset): Promise<{ report: AdsReport; fetchedAt: Date } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('meta_ads_reports')
    .select('report, fetched_at')
    .eq('workspace_id', workspaceId)
    .eq('date_preset', preset)
    .maybeSingle()
  if (error || !data) return null
  const report = data.report as AdsReport
  if (!report || report.schemaVersion !== 1 || !Array.isArray(report.ads)) return null
  return { report, fetchedAt: new Date(data.fetched_at as string) }
}

export async function saveConnection(workspaceId: string, connectionRef: string): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('upsert_meta_ads_connection', { p_workspace_id: workspaceId, p_connection_ref: connectionRef })
  return !error
}

export async function selectAccount(workspaceId: string, account: AdAccount): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('select_meta_ads_account', {
    p_workspace_id: workspaceId,
    p_ad_account_id: account.id,
    p_name: account.name,
    p_currency: account.currency,
    p_timezone: account.timezoneName,
  })
  return !error
}

export async function saveReport(workspaceId: string, preset: DatePreset, adAccountId: string, report: AdsReport | null, error: MetaAdsErrorCode | null, manual: boolean): Promise<boolean> {
  const admin = createAdminClient()
  const { error: rpcError } = await admin.rpc('save_meta_ads_report', {
    p_workspace_id: workspaceId,
    p_date_preset: preset,
    p_ad_account_id: adAccountId,
    p_report: report,
    p_error: error,
    p_manual: manual,
  })
  return !rpcError
}

export async function disconnectConnection(workspaceId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('disconnect_meta_ads_connection', { p_workspace_id: workspaceId })
  return !error
}