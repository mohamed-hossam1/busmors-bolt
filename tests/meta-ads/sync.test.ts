import { test } from 'node:test'
import assert from 'node:assert/strict'

import { runSync, PERIOD_FIELDS, DAILY_FIELDS, AD_BASE_FIELDS, VIDEO_FIELDS, AD_FIELDS } from '../../src/features/meta-ads/sync'
import { ACCOUNT } from './support/fixtures'
import { fakeTransport } from './support/fakes'

const deps = (transport: ReturnType<typeof fakeTransport>['transport']) => ({
  transport,
  workspaceId: 'w1',
  connectionRef: 'ca_1',
  account: ACCOUNT,
  datePreset: 'last_7d' as const,
  now: () => new Date('2026-11-24T10:00:00.000Z'),
})

test('runSync happy path queries period, daily, ad in order', async () => {
  const { transport, calls } = fakeTransport()
  const result = await runSync(deps(transport))
  assert.equal(result.ok, true)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls.map((c) => [c.level, c.daily]), [['account', false], ['account', true], ['ad', false]])
  for (const call of calls) {
    assert.equal(call.adAccountId, 'act_111')
    assert.equal(call.datePreset, 'last_7d')
  }
})

test('runSync sends the verified field lists', async () => {
  const { transport, calls } = fakeTransport()
  await runSync(deps(transport))
  assert.deepEqual(calls[0].fields, PERIOD_FIELDS)
  assert.deepEqual(calls[0].fields, ['spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm', 'actions'])
  assert.deepEqual(calls[1].fields, DAILY_FIELDS)
  assert.deepEqual(calls[1].fields, ['date_start', 'spend', 'impressions', 'clicks', 'actions'])
  assert.ok(!(calls[1].fields as readonly string[]).includes('reach'))
  assert.ok(!(calls[1].fields as readonly string[]).includes('frequency'))
  assert.deepEqual(AD_BASE_FIELDS, ['ad_id', 'ad_name', 'campaign_name', 'objective', 'spend', 'impressions', 'clicks', 'ctr', 'actions'])
  assert.deepEqual(VIDEO_FIELDS, ['video_thruplay_watched_actions', 'video_play_curve_actions'])
  assert.deepEqual(AD_FIELDS, [...AD_BASE_FIELDS, ...VIDEO_FIELDS])
  assert.deepEqual(calls[2].fields, AD_FIELDS)
})

test('runSync builds the report from the period row and ad rows', async () => {
  const { transport } = fakeTransport()
  const result = await runSync(deps(transport))
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.report.generatedAt, '2026-11-24T10:00:00.000Z')
  assert.equal(result.report.summary.results, 38)
  assert.equal(result.report.ads.length, 4)
  assert.equal(result.report.ads[0].videoCurve?.length, 22)
})

test('runSync stops after a period failure', async () => {
  const { transport, calls } = fakeTransport({ failOn: { level: 'account', daily: false, code: 'auth_expired' } })
  const result = await runSync(deps(transport))
  assert.deepEqual(result, { ok: false, code: 'auth_expired' })
  assert.equal(calls.length, 1)
})

test('runSync does not retry a non-invalid_request ad failure', async () => {
  const { transport, calls } = fakeTransport({ failOn: { level: 'ad', daily: false, code: 'provider_error' } })
  const result = await runSync(deps(transport))
  assert.deepEqual(result, { ok: false, code: 'provider_error' })
  assert.equal(calls.length, 3)
})

test('runSync falls back to base fields once when video fields are rejected', async () => {
  const { transport, calls } = fakeTransport({ rejectVideoFields: true })
  const result = await runSync(deps(transport))
  assert.equal(result.ok, true)
  assert.equal(calls.length, 4)
  assert.deepEqual(calls[2].fields, AD_FIELDS)
  assert.deepEqual(calls[3].fields, AD_BASE_FIELDS)
  assert.equal(calls[3].level, 'ad')
  assert.equal(calls[3].daily, false)
  if (!result.ok) return
  assert.equal(result.report.ads.length, 4)
  assert.equal(result.report.summary.results, 38)
  for (const ad of result.report.ads) {
    assert.equal(ad.videoCurve, null)
    assert.equal(ad.holdRate, null)
  }
  const adOne = result.report.ads.find((ad) => ad.adId === '1')
  assert.ok(adOne)
  assert.equal(adOne.hookRate, 0.25)
})

test('runSync returns the failure when both ad tries fail with invalid_request', async () => {
  const { transport, calls } = fakeTransport({ failOn: { level: 'ad', daily: false, code: 'invalid_request' } })
  const result = await runSync(deps(transport))
  assert.deepEqual(result, { ok: false, code: 'invalid_request' })
  assert.equal(calls.length, 4)
  assert.deepEqual(calls[3].fields, AD_BASE_FIELDS)
})

test('runSync touches only getInsights', async () => {
  const { transport } = fakeTransport()
  await runSync(deps(transport))
})