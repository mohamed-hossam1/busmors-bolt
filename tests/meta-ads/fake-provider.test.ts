import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fakeMetaAdsProvider } from '../../src/server/meta-ads/fake-provider'
import { normalizeReport } from '../../src/features/meta-ads/normalize'
import type { AdAccount, InsightsQuery } from '../../src/features/meta-ads/contracts'

const ACCOUNT: AdAccount = { id: 'act_1001', name: 'Demo Shop', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true }

const query = (level: 'account' | 'ad', daily: boolean): InsightsQuery => ({
  adAccountId: ACCOUNT.id,
  level,
  datePreset: 'last_7d',
  daily,
  fields: ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm', 'actions', 'ad_id', 'ad_name', 'campaign_name', 'objective', 'video_thruplay_watched_actions', 'video_play_curve_actions'],
})

test('fakeMetaAdsProvider lists two active accounts', async () => {
  const result = await fakeMetaAdsProvider.listAdAccounts('w1', 'fake:w1')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.length, 2)
  assert.ok(result.value.every((account) => account.active))
  assert.deepEqual(result.value.map((account) => account.id), ['act_1001', 'act_1002'])
})

test('fakeMetaAdsProvider returns insights that normalise into a report', async () => {
  const period = await fakeMetaAdsProvider.getInsights('w1', 'fake:w1', query('account', false))
  const daily = await fakeMetaAdsProvider.getInsights('w1', 'fake:w1', query('account', true))
  const ads = await fakeMetaAdsProvider.getInsights('w1', 'fake:w1', query('ad', false))
  assert.equal(period.ok, true)
  assert.equal(daily.ok, true)
  assert.equal(ads.ok, true)
  if (!period.ok || !daily.ok || !ads.ok) return

  const report = normalizeReport({
    account: ACCOUNT,
    datePreset: 'last_7d',
    generatedAt: '2026-11-24T10:00:00.000Z',
    periodRow: period.value[0] ?? null,
    dailyRows: daily.value,
    adRows: ads.value,
  })

  assert.ok(report.ads.length >= 3)
  assert.ok(report.ads.some((ad) => ad.videoCurve !== null && ad.videoCurve.length === 22))
  assert.ok(report.summary.reach > 0)
})

test('fakeMetaAdsProvider verifies only its own connection ref', async () => {
  assert.equal(await fakeMetaAdsProvider.verifyConnection('w1', 'fake:w1'), true)
  assert.equal(await fakeMetaAdsProvider.verifyConnection('w1', 'fake:w2'), false)
})