import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fakeMetaAdsProvider } from '../../src/server/meta-ads/fake-provider'
import { normalizeReport } from '../../src/features/meta-ads/normalize'
import type { AdAccount, DatePreset, InsightsQuery, RawRow } from '../../src/features/meta-ads/contracts'

const ACCOUNT: AdAccount = { id: 'act_1001', name: 'Demo Shop', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true }

const query = (level: 'account' | 'ad', daily: boolean, datePreset: DatePreset = 'last_7d'): InsightsQuery => ({
  adAccountId: ACCOUNT.id,
  level,
  datePreset,
  daily,
  fields: ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm', 'actions', 'ad_id', 'ad_name', 'campaign_name', 'objective', 'video_thruplay_watched_actions', 'video_play_curve_actions'],
})

async function rows(level: 'account' | 'ad', daily: boolean, datePreset: DatePreset): Promise<RawRow[]> {
  const result = await fakeMetaAdsProvider.getInsights('w1', 'fake:w1', query(level, daily, datePreset))
  assert.equal(result.ok, true)
  if (!result.ok) return []
  return result.value
}

async function buildReport(datePreset: DatePreset) {
  const [periodRows, dailyRows, adRows] = await Promise.all([
    rows('account', false, datePreset),
    rows('account', true, datePreset),
    rows('ad', false, datePreset),
  ])
  return normalizeReport({
    account: ACCOUNT,
    datePreset,
    generatedAt: '2026-11-24T10:00:00.000Z',
    periodRow: periodRows[0] ?? null,
    dailyRows,
    adRows,
  })
}

const DAILY_COUNT: Record<DatePreset, number> = { last_7d: 7, last_30d: 30 }

test('fakeMetaAdsProvider lists two active accounts', async () => {
  const result = await fakeMetaAdsProvider.listAdAccounts('w1', 'fake:w1')
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.value.length, 2)
  assert.deepEqual(result.value.map((account) => account.id), ['act_1001', 'act_1002'])
  for (const account of result.value) {
    assert.equal(account.active, true)
    assert.equal(account.currency, 'EGP')
    assert.equal(account.timezoneName, 'Africa/Cairo')
    assert.ok(account.name.length > 0)
  }
})

test('fakeMetaAdsProvider returns distinct last_7d and last_30d insights', async () => {
  const [daily7, daily30, period7, period30, ads7, ads30] = await Promise.all([
    rows('account', true, 'last_7d'),
    rows('account', true, 'last_30d'),
    rows('account', false, 'last_7d'),
    rows('account', false, 'last_30d'),
    rows('ad', false, 'last_7d'),
    rows('ad', false, 'last_30d'),
  ])

  // Daily volume differs: one week of rows vs one month.
  assert.equal(daily7.length, 7)
  assert.equal(daily30.length, 30)

  // Both windows end on the fixed end date (2026-11-24); the 7-day window is the
  // most recent slice of the 30-day window.
  const dates7 = daily7.map((row) => String(row.date_start))
  const dates30 = daily30.map((row) => String(row.date_start))
  assert.equal(dates7[0], '2026-11-18')
  assert.equal(dates7[dates7.length - 1], '2026-11-24')
  assert.equal(dates30[0], '2026-10-26')
  assert.equal(dates30[dates30.length - 1], '2026-11-24')
  assert.equal(new Set(dates30).size, 30)
  assert.deepEqual(dates7, dates30.slice(-7))

  // Both levels expose the full 60-ad catalogue.
  assert.equal(ads7.length, 60)
  assert.equal(ads30.length, 60)

  // last_30d is a deterministic 4x scale of last_7d at the period level.
  const spend7 = Number(period7[0]?.spend)
  const spend30 = Number(period30[0]?.spend)
  const impr7 = Number(period7[0]?.impressions)
  const impr30 = Number(period30[0]?.impressions)
  assert.equal(spend7, 121185)
  assert.equal(spend30, 484740)
  assert.equal(spend30, spend7 * 4)
  assert.equal(impr7, 1934390)
  assert.equal(impr30, impr7 * 4)

  // ...and at the per-ad level (ad_1 is first in catalogue order).
  assert.equal(ads7[0]?.ad_id, 'ad_1')
  assert.equal(Number(ads7[0]?.spend), 1200)
  assert.equal(Number(ads30[0]?.spend), 4800)
  assert.equal(Number(ads30[0]?.spend), Number(ads7[0]?.spend) * 4)
})

test('fakeMetaAdsProvider normalises into a coherent 50-ad report', async () => {
  for (const datePreset of ['last_7d', 'last_30d'] as const) {
    const adRows = await rows('ad', false, datePreset)
    const report = await buildReport(datePreset)

    // Report metadata echoes the account + preset.
    assert.equal(report.schemaVersion, 1)
    assert.equal(report.adAccountId, ACCOUNT.id)
    assert.equal(report.currency, ACCOUNT.currency)
    assert.equal(report.timezoneName, ACCOUNT.timezoneName)
    assert.equal(report.datePreset, datePreset)

    // 60 ad rows collapse to the top 50 by spend.
    assert.equal(adRows.length, 60)
    assert.equal(report.ads.length, 50)

    // Ads are ordered by descending spend (the truncation contract).
    for (let i = 1; i < report.ads.length; i++) {
      assert.ok(report.ads[i - 1].spend >= report.ads[i].spend)
    }

    // The 50 kept ads are exactly the highest spenders; the dropped tail is cheaper.
    const keptIds = new Set(report.ads.map((ad) => ad.adId))
    const dropped = adRows.filter((row) => !keptIds.has(String(row.ad_id)))
    assert.equal(dropped.length, adRows.length - 50)
    const minKept = Math.min(...report.ads.map((ad) => ad.spend))
    const maxDropped = Math.max(...dropped.map((row) => Number(row.spend)))
    assert.ok(minKept >= maxDropped)

    // The period row is coherent with both the ad rows and the daily series.
    const sumDaily = (key: 'spend' | 'impressions') => report.daily.reduce((acc, point) => acc + point[key], 0)
    const sumAds = (key: 'spend' | 'impressions') => adRows.reduce((acc, row) => acc + Number(row[key] ?? 0), 0)
    assert.equal(sumDaily('spend'), report.summary.spend)
    assert.equal(sumDaily('impressions'), report.summary.impressions)
    assert.equal(sumAds('spend'), report.summary.spend)
    assert.equal(sumAds('impressions'), report.summary.impressions)

    // Reach stays below impressions (frequency > 1) and the KPI block is populated.
    assert.equal(report.summary.frequency, 2.15)
    assert.ok(report.summary.reach > 0)
    assert.ok(report.summary.reach < report.summary.impressions)
    assert.ok(report.summary.ctr !== null && report.summary.ctr > 0)

    // Daily series has the right length and is sorted ascending by date.
    assert.equal(report.daily.length, DAILY_COUNT[datePreset])
    for (let i = 1; i < report.daily.length; i++) {
      assert.ok(report.daily[i - 1].date <= report.daily[i].date)
    }
  }
})

test('fakeMetaAdsProvider report exercises all four health states and video curves', async () => {
  for (const datePreset of ['last_7d', 'last_30d'] as const) {
    const report = await buildReport(datePreset)

    const healthCounts = { good: 0, average: 0, poor: 0, unknown: 0 }
    const kindCounts = { messages: 0, leads: 0, purchases: 0, clicks: 0 }
    let videoAds = 0

    for (const ad of report.ads) {
      healthCounts[ad.health]++
      kindCounts[ad.resultKind]++

      const curve = ad.videoCurve
      if (curve !== null) {
        videoAds++
        // Video ads always expose a 22-point retention curve plus hook/hold rates.
        assert.equal(curve.length, 22)
        assert.ok(ad.hookRate !== null && ad.hookRate > 0)
        assert.ok(ad.holdRate !== null)
        assert.equal(curve[0].second, 0)
        assert.equal(curve[0].label, '0:00')
        assert.equal(curve[0].percent, 100)
        for (const point of curve) {
          assert.equal(typeof point.second, 'number')
          assert.equal(typeof point.label, 'string')
          assert.ok(Number.isFinite(point.percent))
        }
      } else {
        // Non-video ads carry no retention data at all.
        assert.equal(ad.hookRate, null)
        assert.equal(ad.holdRate, null)
      }
    }

    // Every health state and every result kind is represented.
    assert.ok(healthCounts.good > 0, 'expected at least one good ad')
    assert.ok(healthCounts.average > 0, 'expected at least one average ad')
    assert.ok(healthCounts.poor > 0, 'expected at least one poor ad')
    assert.ok(healthCounts.unknown > 0, 'expected at least one unknown ad')
    assert.ok(kindCounts.messages > 0)
    assert.ok(kindCounts.leads > 0)
    assert.ok(kindCounts.purchases > 0)
    assert.ok(kindCounts.clicks > 0)

    // A healthy mix of video and static/carousel ads.
    assert.equal(videoAds, 23)
    assert.equal(report.ads.length - videoAds, 27)

    // Unknown health is reserved for sub-500-impression (tiny delivery) ads.
    for (const ad of report.ads) {
      if (ad.health === 'unknown') assert.ok(ad.impressions < 500)
    }
  }
})

test('fakeMetaAdsProvider canaries and video curve modes behave as designed', async () => {
  const report = await buildReport('last_7d')
  const byId = new Map(report.ads.map((ad) => [ad.adId, ad]))

  // spec 2: tiny delivery (110 impressions) -> unknown health.
  const unknown = byId.get('ad_3')
  assert.ok(unknown)
  assert.equal(unknown?.health, 'unknown')
  assert.equal(unknown?.impressions, 110)

  // spec 0: strong hook + strong hold, cheap -> good health, percent-mode curve.
  const strongHold = byId.get('ad_1')
  assert.ok(strongHold)
  assert.equal(strongHold?.health, 'good')
  assert.equal(strongHold?.resultKind, 'messages')
  assert.deepEqual(strongHold?.videoCurve?.slice(0, 3).map((point) => point.percent), [100, 92, 80])

  // spec 3: count-mode curve is normalised so its first point is 100%.
  const countMode = byId.get('ad_4')
  assert.ok(countMode)
  assert.equal(countMode?.health, 'good')
  assert.equal(countMode?.resultKind, 'clicks')
  assert.equal(countMode?.videoCurve?.[0].percent, 100)
  assert.deepEqual(countMode?.videoCurve?.slice(0, 3).map((point) => point.percent), [100, 80, 60])
})

test('fakeMetaAdsProvider verifies only its own connection ref', async () => {
  // startConnection hands back a callback URL carrying the pending account id.
  const started = await fakeMetaAdsProvider.startConnection('w1', 'https://app.example/callback')
  const redirect = new URL(started.redirectUrl)
  assert.equal(redirect.searchParams.get('status'), 'success')
  const accountId = redirect.searchParams.get('connected_account_id')
  assert.ok(accountId !== null && accountId.startsWith('fake_'))

  // Completing with that account id yields a workspace-scoped connection ref.
  const completed = await fakeMetaAdsProvider.completeConnection('w1', redirect.searchParams)
  assert.equal(completed.ok, true)
  if (!completed.ok) return
  assert.equal(completed.connectionRef, 'fake:w1')

  // verifyConnection accepts only the matching workspace's ref.
  assert.equal(await fakeMetaAdsProvider.verifyConnection('w1', completed.connectionRef), true)
  assert.equal(await fakeMetaAdsProvider.verifyConnection('w1', 'fake:w2'), false)
  assert.equal(await fakeMetaAdsProvider.verifyConnection('w2', 'fake:w1'), false)

  // Denied callbacks and mismatched account ids are rejected.
  const denied = await fakeMetaAdsProvider.completeConnection('w1', new URLSearchParams('status=denied'))
  assert.deepEqual(denied, { ok: false, reason: 'denied' })
  const invalid = await fakeMetaAdsProvider.completeConnection('w1', new URLSearchParams('status=success&connected_account_id=someone_else'))
  assert.deepEqual(invalid, { ok: false, reason: 'invalid' })
})