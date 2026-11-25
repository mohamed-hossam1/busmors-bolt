import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeReport } from '../../src/features/meta-ads/normalize'
import { ACCOUNT, PERIOD_ROW, DAILY_ROWS, AD_ROWS } from './support/fixtures'

const report = normalizeReport({
  account: ACCOUNT,
  datePreset: 'last_7d',
  generatedAt: '2026-11-24T10:00:00.000Z',
  periodRow: PERIOD_ROW,
  dailyRows: DAILY_ROWS,
  adRows: AD_ROWS,
})

test('report fields come straight from the input', () => {
  assert.equal(report.schemaVersion, 1)
  assert.equal(report.adAccountId, 'act_111')
  assert.equal(report.currency, 'EGP')
  assert.equal(report.timezoneName, 'Africa/Cairo')
  assert.equal(report.datePreset, 'last_7d')
  assert.equal(report.generatedAt, '2026-11-24T10:00:00.000Z')
})

test('summary is taken from the period row', () => {
  assert.equal(report.summary.spend, 700)
  assert.equal(report.summary.impressions, 20000)
  assert.equal(report.summary.reach, 9000)
  assert.equal(report.summary.frequency, 2.22)
  assert.equal(report.summary.clicks, 300)
  assert.equal(report.summary.ctr, 0.015)
  assert.equal(report.summary.cpc, 2.33)
  assert.equal(report.summary.cpm, 35)
})

test('dominant result kind is the kind with the most spend', () => {
  assert.equal(report.summary.resultKind, 'messages')
})

test('summary results come from the period row, not the per-ad sum', () => {
  assert.equal(report.summary.results, 38)
  assert.ok(Math.abs(report.summary.costPerResult! - 700 / 38) < 1e-9)
})

test('daily rows are sorted oldest first and carry no reach key', () => {
  assert.deepEqual(report.daily, [
    { date: '2026-11-01', spend: 200, impressions: 6000, clicks: 90, results: 10 },
    { date: '2026-11-02', spend: 200, impressions: 6000, clicks: 90, results: 13 },
    { date: '2026-11-03', spend: 300, impressions: 8000, clicks: 120, results: 15 },
  ])
  for (const point of report.daily) {
    assert.equal(Object.prototype.hasOwnProperty.call(point, 'reach'), false)
  }
})

test('ads are sorted by spend descending with the zero-spend ad last', () => {
  assert.deepEqual(report.ads.map((a) => a.adId), ['1', '2', '3', '4'])
})

test('ad 1 hook rate, hold rate, curve, cost and health', () => {
  const ad = report.ads.find((a) => a.adId === '1')!
  assert.equal(ad.resultKind, 'messages')
  assert.equal(ad.results, 25)
  assert.equal(ad.costPerResult, 16)
  assert.equal(ad.ctr, 0.0125)
  assert.equal(ad.hookRate, 0.25)
  assert.equal(ad.holdRate, 0.2)
  assert.equal(ad.videoCurve!.length, 22)
  assert.equal(ad.videoCurve![16].label, '0:20')
  assert.equal(ad.health, 'average')
})

test('ad 2 has no video data and is poor', () => {
  const ad = report.ads.find((a) => a.adId === '2')!
  assert.equal(ad.results, 10)
  assert.equal(ad.costPerResult, 25)
  assert.equal(ad.hookRate, null)
  assert.equal(ad.holdRate, null)
  assert.equal(ad.videoCurve, null)
  assert.equal(ad.health, 'poor')
})

test('ad 3 is a clicks ad in good health', () => {
  const ad = report.ads.find((a) => a.adId === '3')!
  assert.equal(ad.resultKind, 'clicks')
  assert.equal(ad.results, 40)
  assert.equal(ad.costPerResult, 1.25)
  assert.equal(ad.health, 'good')
})

test('ad 4 is a zero-result unknown ad', () => {
  const ad = report.ads.find((a) => a.adId === '4')!
  assert.equal(ad.resultKind, 'clicks')
  assert.equal(ad.results, 0)
  assert.equal(ad.costPerResult, null)
  assert.equal(ad.health, 'unknown')
})

test('empty input produces a zero summary and empty lists', () => {
  const empty = normalizeReport({ account: ACCOUNT, datePreset: 'last_30d', generatedAt: 'x', periodRow: null, dailyRows: [], adRows: [] })
  assert.deepEqual(empty.summary, { spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: null, cpc: null, cpm: null, results: 0, resultKind: 'clicks', costPerResult: null })
  assert.deepEqual(empty.daily, [])
  assert.deepEqual(empty.ads, [])
})

test('rows without ad_id or date_start are dropped', () => {
  const result = normalizeReport({
    account: ACCOUNT,
    datePreset: 'last_7d',
    generatedAt: 'x',
    periodRow: null,
    dailyRows: [{ spend: '5' }, { date_start: '2026-11-01', spend: '1', impressions: '1', clicks: '1' }],
    adRows: [{ spend: '5' }, { ad_id: '9', spend: '2', impressions: '1000', clicks: '1', ctr: '0.1' }],
  })
  assert.equal(result.ads.length, 1)
  assert.equal(result.ads[0].adId, '9')
  assert.equal(result.daily.length, 1)
  assert.equal(result.daily[0].date, '2026-11-01')
})

test('ads are capped at 50 after sorting by spend descending', () => {
  const generated = Array.from({ length: 60 }, (_, i) => ({
    ad_id: String(i),
    ad_name: 'g' + i,
    campaign_name: 'c',
    objective: null,
    spend: String(i),
    impressions: '1000',
    clicks: '1',
    ctr: '0.1',
  }))
  const result = normalizeReport({ account: ACCOUNT, datePreset: 'last_7d', generatedAt: 'x', periodRow: null, dailyRows: [], adRows: generated })
  assert.equal(result.ads.length, 50)
  assert.equal(result.ads[0].adId, '59')
  assert.equal(result.ads[49].adId, '10')
})