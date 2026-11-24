import type { AdAccount, AdsReport, DatePreset, MetaAdsErrorCode, MetaAdsTransport } from './contracts'
import { normalizeReport } from './normalize'

export const PERIOD_FIELDS = ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm', 'actions']
export const DAILY_FIELDS = ['date_start', 'spend', 'impressions', 'clicks', 'actions']
export const AD_BASE_FIELDS = ['ad_id', 'ad_name', 'campaign_name', 'objective', 'spend', 'impressions', 'clicks', 'ctr', 'actions']
export const VIDEO_FIELDS = ['video_thruplay_watched_actions', 'video_play_curve_actions']
export const AD_FIELDS = [...AD_BASE_FIELDS, ...VIDEO_FIELDS]

/**
 * Runs the three insights queries in order (period, daily, ad) and normalises the
 * rows into an AdsReport. The ad call retries exactly once with AD_BASE_FIELDS when
 * Meta rejects the two video fields with `invalid_request`; every other failure is
 * returned immediately. Period and daily failures never retry.
 */
export async function runSync(deps: {
  transport: MetaAdsTransport
  workspaceId: string
  connectionRef: string
  account: AdAccount
  datePreset: DatePreset
  now: () => Date
}): Promise<{ ok: true; report: AdsReport } | { ok: false; code: MetaAdsErrorCode }> {
  const { transport, workspaceId, connectionRef, account, datePreset, now } = deps

  const period = await transport.getInsights(workspaceId, connectionRef, {
    adAccountId: account.id,
    level: 'account',
    datePreset,
    daily: false,
    fields: PERIOD_FIELDS,
  })
  if (!period.ok) return period

  const daily = await transport.getInsights(workspaceId, connectionRef, {
    adAccountId: account.id,
    level: 'account',
    datePreset,
    daily: true,
    fields: DAILY_FIELDS,
  })
  if (!daily.ok) return daily

  let ads = await transport.getInsights(workspaceId, connectionRef, {
    adAccountId: account.id,
    level: 'ad',
    datePreset,
    daily: false,
    fields: AD_FIELDS,
  })
  if (!ads.ok && ads.code === 'invalid_request') {
    ads = await transport.getInsights(workspaceId, connectionRef, {
      adAccountId: account.id,
      level: 'ad',
      datePreset,
      daily: false,
      fields: AD_BASE_FIELDS,
    })
  }
  if (!ads.ok) return ads

  return {
    ok: true,
    report: normalizeReport({
      account,
      datePreset,
      generatedAt: now().toISOString(),
      periodRow: period.value[0] ?? null,
      dailyRows: daily.value,
      adRows: ads.value,
    }),
  }
}