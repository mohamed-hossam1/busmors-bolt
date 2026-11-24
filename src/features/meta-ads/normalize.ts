import type { AdAccount, AdRow, AdsReport, DailyPoint, DatePreset, Health, KpiSummary, RawRow, ResultKind } from './contracts'
import { num } from './contracts'
import { actionValue, primaryResult, resultForKind } from './objective-map'
import { toVideoCurve } from './video-curve'

const KIND_PRIORITY: readonly ResultKind[] = ['messages', 'leads', 'purchases', 'clicks']

function buildAd(row: RawRow): AdRow | null {
  if (typeof row.ad_id !== 'string' || row.ad_id === '') return null
  const objective = typeof row.objective === 'string' ? row.objective : null
  const spend = num(row.spend)
  const impressions = num(row.impressions)
  const clicks = num(row.clicks)
  const ctr = row.ctr == null ? null : num(row.ctr) / 100
  const { kind, value } = primaryResult(objective, row.actions, clicks)
  const costPerResult = value > 0 ? spend / value : null
  const video3s = actionValue(row.actions, ['video_view'])
  const hookRate = video3s !== null && video3s > 0 && impressions > 0 ? video3s / impressions : null
  const thru = actionValue(row.video_thruplay_watched_actions, ['video_view'])
  const holdRate = video3s !== null && video3s > 0 && thru !== null ? thru / video3s : null
  const videoCurve = toVideoCurve(row.video_play_curve_actions)
  const adName = typeof row.ad_name === 'string' ? row.ad_name : row.ad_id
  const campaignName = typeof row.campaign_name === 'string' ? row.campaign_name : ''
  return {
    adId: row.ad_id,
    adName,
    campaignName,
    objective,
    spend,
    impressions,
    clicks,
    ctr,
    results: value,
    resultKind: kind,
    costPerResult,
    hookRate,
    holdRate,
    videoCurve,
    health: 'unknown',
  }
}

function dominantKind(ads: AdRow[]): ResultKind {
  const totals: Record<ResultKind, number> = { messages: 0, leads: 0, purchases: 0, clicks: 0 }
  for (const ad of ads) totals[ad.resultKind] += ad.spend
  let best: ResultKind = 'clicks'
  let bestSpend = 0
  for (const kind of KIND_PRIORITY) {
    if (totals[kind] > bestSpend) {
      bestSpend = totals[kind]
      best = kind
    }
  }
  return best
}

function buildSummary(p: RawRow | null, dominant: ResultKind): KpiSummary {
  if (p === null) {
    return { spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: null, cpc: null, cpm: null, results: 0, resultKind: dominant, costPerResult: null }
  }
  const spend = num(p.spend)
  const clicks = num(p.clicks)
  const results = resultForKind(dominant, p.actions, clicks)
  return {
    spend,
    impressions: num(p.impressions),
    reach: num(p.reach),
    frequency: num(p.frequency),
    clicks,
    ctr: p.ctr == null ? null : num(p.ctr) / 100,
    cpc: p.cpc == null ? null : num(p.cpc),
    cpm: p.cpm == null ? null : num(p.cpm),
    results,
    resultKind: dominant,
    costPerResult: results > 0 ? spend / results : null,
  }
}

function buildDaily(rows: RawRow[], dominant: ResultKind): DailyPoint[] {
  const points: DailyPoint[] = []
  for (const row of rows) {
    if (typeof row.date_start !== 'string') continue
    const clicks = num(row.clicks)
    points.push({
      date: row.date_start,
      spend: num(row.spend),
      impressions: num(row.impressions),
      clicks,
      results: resultForKind(dominant, row.actions, clicks),
    })
  }
  points.sort((a, b) => a.date.localeCompare(b.date))
  return points
}

function computeHealth(ad: AdRow, summary: KpiSummary, avg: number): Health {
  if (ad.impressions < 500) return 'unknown'
  if (ad.resultKind === 'clicks') {
    if (ad.ctr === null || summary.ctr === null || summary.ctr === 0) return 'unknown'
    if (ad.ctr >= 1.25 * summary.ctr) return 'good'
    if (ad.ctr <= 0.8 * summary.ctr) return 'poor'
    return 'average'
  }
  if (ad.costPerResult === null) return ad.spend > 0 ? 'poor' : 'unknown'
  if (ad.costPerResult <= 0.8 * avg) return 'good'
  if (ad.costPerResult >= 1.25 * avg) return 'poor'
  return 'average'
}

function applyHealth(ads: AdRow[], summary: KpiSummary): void {
  const spendByKind: Record<ResultKind, number> = { messages: 0, leads: 0, purchases: 0, clicks: 0 }
  const resultsByKind: Record<ResultKind, number> = { messages: 0, leads: 0, purchases: 0, clicks: 0 }
  for (const ad of ads) {
    if (ad.results > 0) {
      spendByKind[ad.resultKind] += ad.spend
      resultsByKind[ad.resultKind] += ad.results
    }
  }
  const avgByKind: Record<ResultKind, number> = { messages: 0, leads: 0, purchases: 0, clicks: 0 }
  for (const kind of KIND_PRIORITY) {
    avgByKind[kind] = resultsByKind[kind] > 0 ? spendByKind[kind] / resultsByKind[kind] : 0
  }
  for (const ad of ads) {
    ad.health = computeHealth(ad, summary, avgByKind[ad.resultKind])
  }
}

export function normalizeReport(input: {
  account: AdAccount
  datePreset: DatePreset
  generatedAt: string
  periodRow: RawRow | null
  dailyRows: RawRow[]
  adRows: RawRow[]
}): AdsReport {
  const allAds = input.adRows.map(buildAd).filter((ad): ad is AdRow => ad !== null)
  const dominant = dominantKind(allAds)
  const summary = buildSummary(input.periodRow, dominant)
  const daily = buildDaily(input.dailyRows, dominant)
  const ads = allAds.sort((a, b) => b.spend - a.spend).slice(0, 50)
  applyHealth(ads, summary)
  return {
    schemaVersion: 1,
    adAccountId: input.account.id,
    currency: input.account.currency,
    timezoneName: input.account.timezoneName,
    datePreset: input.datePreset,
    generatedAt: input.generatedAt,
    summary,
    daily,
    ads,
  }
}