import 'server-only'
import type { AdAccount, DatePreset, InsightsQuery, RawRow, TransportResult } from '../../features/meta-ads/contracts'
import type { MetaAdsProvider } from './provider'

/*
 * Development and tests only (META_ADS_PROVIDER=fake; refused in production by
 * getMetaAdsProvider). Imports are relative only, and this file must never import
 * composio-provider.ts or @composio/core.
 *
 * TEMPORARY, enriched dataset for manual UI testing. It is generated deterministically
 * (no randomness) from the base spec table below so that:
 *   - last_7d returns 7 daily rows and last_30d returns 30 daily rows (~4x the volume),
 *   - the period row is always coherent with the ad rows (it is summed from them),
 *   - reach stays below impressions via a fixed frequency.
 * Restore the original small dataset from git once UI testing is done.
 */

const M = 'onsite_conversion.messaging_conversation_started_7d'
const LEAD = 'lead'
const PURCHASE = 'purchase'
const VIDEO_VIEW = 'video_view'

/*
 * 22-point retention curves, aligned to CURVE_SECONDS in features/meta-ads/video-curve.ts:
 * index -> second: 0:0 1:1 2:2 3:3 4:4 5:5 6:6 7:7 8:8 9:9 10:10 11:11 12:12 13:13
 *                  14:14 15:15 16:20 17:25 18:30 19:40 20:50 21:60
 * The first three are percent-mode (0..100). The last two are count-mode (any value > 100
 * switches toVideoCurve into count normalisation, dividing every point by the first).
 */
const CURVE_STRONG_HOLD = [100, 92, 80, 68, 62, 58, 55, 53, 51, 50, 49, 48, 47, 46, 44, 42, 39, 36, 33, 31, 29, 28]
const CURVE_STRONG_DROP = [100, 88, 74, 64, 50, 40, 33, 28, 24, 21, 19, 17, 16, 15, 14, 14, 11, 9, 7, 5, 4, 3]
const CURVE_WEAK_STEADY = [100, 60, 35, 21, 20, 20, 19, 19, 19, 18, 18, 18, 17, 17, 17, 17, 16, 15, 15, 14, 13, 13]
const CURVE_COUNT_A = [12000, 9600, 7200, 5600, 4700, 4100, 3650, 3300, 3020, 2790, 2600, 2440, 2300, 2180, 2070, 1970, 1880, 1830, 1800, 1770, 1785, 1800]
const CURVE_COUNT_B = [9000, 6200, 4100, 3000, 2400, 2000, 1750, 1600, 1500, 1430, 1380, 1340, 1310, 1290, 1270, 1250, 1230, 1210, 1190, 1170, 1160, 1150]
const CURVES: readonly (readonly number[])[] = [CURVE_STRONG_HOLD, CURVE_STRONG_DROP, CURVE_WEAK_STEADY, CURVE_COUNT_A, CURVE_COUNT_B]

const CAMPAIGNS = [
  'حملة الشتاء | Winter Sale',
  'Reels Awareness — الوعي بالعلامة',
  'Cart Recovery — استرجاع السلة',
  'New Collection — تشكيلة جديدة',
  'Flash Offer — عرض خاطف',
  'Lead Generation — جذب العملاء',
  'Retargeting — إعادة الاستهداف',
] as const

const REEL_NAMES = ['ريل – إعلان المنتج', 'Reel – Behind the Scenes', 'ريل – تجربة العميل', 'Reel – Unboxing', 'ريل – العرض الخاطف', 'Reel – Room Tour'] as const
const VIDEO_NAMES = ['فيديو – قصة العلامة', 'Video – Tutorial', 'فيديو – شهادة عميل', 'Video – Demo'] as const
const STATIC_NAMES = ['منشور ثابت – العرض الرئيسي', 'Static Post – Hero Banner', 'منشور – اقتباس العميل', 'Static – Countdown', 'منشور – مقارنة المنتجات'] as const
const CAROUSEL_NAMES = ['كاروسيل – المنتجات', 'Carousel – Best Sellers', 'كاروسيل – قبل وبعد', 'Carousel – خطوات الاستخدام'] as const

type Kind = 'messages' | 'leads' | 'purchases' | 'clicks'
const KIND_OBJECTIVE: Record<Kind, string> = {
  messages: 'OUTCOME_ENGAGEMENT',
  leads: 'OUTCOME_LEADS',
  purchases: 'OUTCOME_SALES',
  clicks: 'OUTCOME_TRAFFIC',
}

interface AdSpec {
  adName: string
  campaign: string
  kind: Kind
  videoCurve: readonly number[] | null
  spend: number
  impressions: number
  ctr: number
  results: number
}

const round2 = (value: number): number => Math.round(value * 100) / 100

/*
 * Builds the 60-ad base spec (last_7d scale). The first 25 are video/reel ads cycling the
 * five retention curves (so all four patterns and both count-mode curves appear); the
 * remaining 35 are static/carousel ads with no video fields. Objectives cycle through the
 * four result kinds, spend is a deterministic spread over 50..4500 EGP, and a handful of
 * indices are then overridden into health canaries (good/average/poor/unknown, zero-spend).
 */
function buildSpecs(): AdSpec[] {
  const kinds: Kind[] = ['messages', 'leads', 'purchases', 'clicks']
  const specs: AdSpec[] = []
  for (let i = 0; i < 60; i++) {
    const kind = kinds[i % kinds.length]
    const isVideo = i < 25
    let adName: string
    if (isVideo) {
      const pool = i % 3 === 0 ? REEL_NAMES : VIDEO_NAMES
      adName = pool[i % pool.length]
    } else if (i % 2 === 0) {
      adName = CAROUSEL_NAMES[i % CAROUSEL_NAMES.length]
    } else {
      adName = STATIC_NAMES[i % STATIC_NAMES.length]
    }
    const spend = Math.round((50 + ((i * 2654) % 4451)) / 5) * 5
    const impressions = Math.round(spend * (13 + (i % 8)))
    const ctr = round2(0.7 + ((i * 37) % 33) / 10)
    const results = Math.max(0, Math.round(spend / (6 + (i % 6) * 5)))
    specs.push({
      adName: `${adName} #${i + 1}`,
      campaign: CAMPAIGNS[i % CAMPAIGNS.length],
      kind,
      videoCurve: isVideo ? CURVES[i % CURVES.length] : null,
      spend,
      impressions,
      ctr,
      results,
    })
  }

  // Health canaries. The normaliser derives health from cost-per-result vs the per-kind
  // average (non-click) or ctr vs the account ctr (click), and marks impressions < 500 unknown.
  specs[0] = { ...specs[0], kind: 'messages', videoCurve: CURVE_STRONG_HOLD, spend: 1200, impressions: 26000, ctr: 1.6, results: 240 } // strong hook + strong hold, cheap -> good
  specs[1] = { ...specs[1], kind: 'leads', videoCurve: CURVE_STRONG_DROP, spend: 1100, impressions: 24000, ctr: 1.4, results: 5 } // strong hook + sharp drop, pricey -> poor
  specs[2] = { ...specs[2], kind: 'purchases', videoCurve: CURVE_WEAK_STEADY, spend: 680, impressions: 110, ctr: 1.1, results: 4 } // weak hook + steady hold, tiny delivery -> unknown
  specs[3] = { ...specs[3], kind: 'clicks', videoCurve: CURVE_COUNT_A, spend: 900, impressions: 30000, ctr: 3.6, results: 0 } // count-mode, high ctr -> good
  specs[4] = { ...specs[4], kind: 'clicks', videoCurve: CURVE_COUNT_B, spend: 850, impressions: 28000, ctr: 0.6, results: 0 } // count-mode, low ctr -> poor
  specs[5] = { ...specs[5], kind: 'messages', videoCurve: CURVE_STRONG_HOLD, spend: 950, impressions: 19000, ctr: 1.5, results: 48 } // mid cost-per-result -> average
  specs[6] = { ...specs[6], kind: 'leads', videoCurve: CURVE_WEAK_STEADY, spend: 1000, impressions: 21000, ctr: 1.3, results: 12 } // average lead cost
  specs[7] = { ...specs[7], kind: 'purchases', videoCurve: CURVE_STRONG_DROP, spend: 1000, impressions: 22000, ctr: 1.2, results: 3 } // expensive purchases -> poor

  // Two tiny-delivery "unknown" ads that still clear the top-50 spend cut.
  specs[9] = { ...specs[9], kind: 'messages', impressions: 110, spend: Math.max(specs[9].spend, 600) }
  specs[23] = { ...specs[23], kind: 'clicks', impressions: 115, spend: Math.max(specs[23].spend, 600) }

  // Two zero-spend ads that fall past the 50-ad cap.
  specs[58] = { ...specs[58], spend: 0, impressions: 0, ctr: 0, results: 0 }
  specs[59] = { ...specs[59], spend: 0, impressions: 0, ctr: 0, results: 0 }
  // Fix the loop-assigned fields the literal overrides above do not carry.
  for (const index of [58, 59]) specs[index] = { ...specs[index], adName: `Post — Spec #${index + 1}`, campaign: CAMPAIGNS[index % CAMPAIGNS.length] }

  return specs
}

const SPECS = buildSpecs()

const resultActionType = (kind: Kind): string | null => {
  if (kind === 'messages') return M
  if (kind === 'leads') return LEAD
  if (kind === 'purchases') return PURCHASE
  return null
}

interface Totals {
  spend: number
  impressions: number
  clicks: number
  messages: number
  leads: number
  purchases: number
}

const emptyTotals = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, messages: 0, leads: 0, purchases: 0 })

function materialiseAd(spec: AdSpec, index: number, scale: number): { row: RawRow; totals: Totals } {
  const spend = round2(spec.spend * scale)
  const impressions = Math.round(spec.impressions * scale)
  const clicks = Math.round((impressions * spec.ctr) / 100)
  const results = Math.round(spec.results * scale)
  const totals: Totals = {
    spend,
    impressions,
    clicks,
    messages: spec.kind === 'messages' ? results : 0,
    leads: spec.kind === 'leads' ? results : 0,
    purchases: spec.kind === 'purchases' ? results : 0,
  }

  const actions: RawRow[] = []
  const actionType = resultActionType(spec.kind)
  if (actionType !== null && results > 0) actions.push({ action_type: actionType, value: String(results) })

  const row: RawRow = {
    ad_id: `ad_${index + 1}`,
    ad_name: spec.adName,
    campaign_name: spec.campaign,
    objective: KIND_OBJECTIVE[spec.kind],
    spend: String(spend),
    impressions: String(impressions),
    clicks: String(clicks),
    ctr: String(spec.ctr),
    actions,
  }

  if (spec.videoCurve !== null) {
    const countMode = spec.videoCurve.some((value) => value > 100)
    let video3s: number
    let thru: number
    let curveValues: number[]
    if (countMode) {
      curveValues = spec.videoCurve.map((value) => Math.round(value * scale))
      video3s = curveValues[3]
      thru = curveValues[15]
    } else {
      curveValues = spec.videoCurve.map((value) => value)
      video3s = Math.round((impressions * spec.videoCurve[3]) / 100)
      thru = Math.round((impressions * spec.videoCurve[15]) / 100)
    }
    if (video3s > 0) actions.push({ action_type: VIDEO_VIEW, value: String(video3s) })
    row.video_thruplay_watched_actions = [{ action_type: VIDEO_VIEW, value: String(thru) }]
    row.video_play_curve_actions = [{ action_type: VIDEO_VIEW, value: curveValues }]
  }

  return { row, totals }
}

function buildAdsAndTotals(scale: number): { ads: RawRow[]; totals: Totals } {
  const ads: RawRow[] = []
  const totals = emptyTotals()
  SPECS.forEach((spec, index) => {
    const { row, totals: adTotals } = materialiseAd(spec, index, scale)
    ads.push(row)
    totals.spend = round2(totals.spend + adTotals.spend)
    totals.impressions += adTotals.impressions
    totals.clicks += adTotals.clicks
    totals.messages += adTotals.messages
    totals.leads += adTotals.leads
    totals.purchases += adTotals.purchases
  })
  return { ads, totals }
}

function buildPeriod(totals: Totals): RawRow {
  const frequency = 2.15
  const reach = Math.round(totals.impressions / frequency)
  const ctr = totals.impressions > 0 ? round2((totals.clicks / totals.impressions) * 100) : 0
  const cpc = totals.clicks > 0 ? round2(totals.spend / totals.clicks) : 0
  const cpm = totals.impressions > 0 ? round2((totals.spend / totals.impressions) * 1000) : 0
  const actions: RawRow[] = []
  if (totals.messages > 0) actions.push({ action_type: M, value: String(totals.messages) })
  if (totals.leads > 0) actions.push({ action_type: LEAD, value: String(totals.leads) })
  if (totals.purchases > 0) actions.push({ action_type: PURCHASE, value: String(totals.purchases) })
  return {
    spend: String(round2(totals.spend)),
    impressions: String(totals.impressions),
    reach: String(reach),
    frequency: String(frequency),
    clicks: String(totals.clicks),
    ctr: String(ctr),
    cpc: String(cpc),
    cpm: String(cpm),
    actions,
  }
}

function endDateUTC(): number {
  return Date.UTC(2026, 10, 24) // 2026-11-24
}

function dateStrings(count: number): string[] {
  const end = endDateUTC()
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10))
  return out
}

function dayWeights(count: number): number[] {
  const weights: number[] = []
  for (let i = 0; i < count; i++) {
    weights.push(1 + 0.32 * Math.sin(i * 1.1 + 0.6) + 0.18 * Math.cos(i * 0.5))
  }
  return weights
}

function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  const out: number[] = []
  let allocated = 0
  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) {
      out.push(Math.max(0, Math.round(total) - allocated))
    } else {
      const value = Math.round((total * weights[i]) / sum)
      out.push(value)
      allocated += value
    }
  }
  return out
}

function buildDaily(totals: Totals, preset: DatePreset): RawRow[] {
  const count = preset === 'last_30d' ? 30 : 7
  const dates = dateStrings(count)
  const weights = dayWeights(count)
  const spend = apportion(totals.spend, weights)
  const impressions = apportion(totals.impressions, weights)
  const clicks = apportion(totals.clicks, weights)
  const messages = apportion(totals.messages, weights)
  const leads = apportion(totals.leads, weights)
  const purchases = apportion(totals.purchases, weights)

  const rows: RawRow[] = []
  for (let i = 0; i < count; i++) {
    const actions: RawRow[] = []
    if (messages[i] > 0) actions.push({ action_type: M, value: String(messages[i]) })
    if (leads[i] > 0) actions.push({ action_type: LEAD, value: String(leads[i]) })
    if (purchases[i] > 0) actions.push({ action_type: PURCHASE, value: String(purchases[i]) })
    rows.push({
      date_start: dates[i],
      spend: String(spend[i]),
      impressions: String(impressions[i]),
      clicks: String(clicks[i]),
      actions,
    })
  }
  return rows
}

function buildDataset(preset: DatePreset): { period: RawRow; daily: RawRow[]; ads: RawRow[] } {
  const scale = preset === 'last_30d' ? 4 : 1
  const { ads, totals } = buildAdsAndTotals(scale)
  return { period: buildPeriod(totals), daily: buildDaily(totals, preset), ads }
}

const ACCOUNTS: AdAccount[] = [
  { id: 'act_1001', name: 'Demo Shop', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true },
  { id: 'act_1002', name: 'Demo Clinic', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true },
]

function fakeAccountId(workspaceId: string): string {
  return 'fake_' + workspaceId.replace(/-/g, '').slice(0, 20)
}

export const fakeMetaAdsProvider: MetaAdsProvider = {
  name: 'fake',

  async startConnection(workspaceId, callbackUrl) {
    return { redirectUrl: callbackUrl + (callbackUrl.includes('?') ? '&' : '?') + 'status=success&connected_account_id=' + fakeAccountId(workspaceId) }
  },

  async completeConnection(workspaceId, callbackParams) {
    if (callbackParams.get('status') !== 'success') return { ok: false, reason: 'denied' }
    if (callbackParams.get('connected_account_id') === fakeAccountId(workspaceId)) return { ok: true, connectionRef: 'fake:' + workspaceId }
    return { ok: false, reason: 'invalid' }
  },

  async verifyConnection(workspaceId, connectionRef) {
    return connectionRef === 'fake:' + workspaceId
  },

  async listAdAccounts(): Promise<TransportResult<AdAccount[]>> {
    return { ok: true, value: ACCOUNTS.map((account) => ({ ...account })) }
  },

  async getInsights(_workspaceId, _connectionRef, query: InsightsQuery): Promise<TransportResult<RawRow[]>> {
    const dataset = buildDataset(query.datePreset)
    if (query.level === 'ad') return { ok: true, value: dataset.ads }
    return { ok: true, value: query.daily ? dataset.daily : [dataset.period] }
  },

  async disconnect() {},
}