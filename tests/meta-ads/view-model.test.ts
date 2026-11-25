import { test } from 'node:test'
import assert from 'node:assert/strict'

import { rangeFromParam, summarySentence, shouldAutoSync, reportStatus } from '../../src/features/meta-ads/view-model'
import type { SyncUiState } from '../../src/features/meta-ads/view-model'
import { normalizeReport } from '../../src/features/meta-ads/normalize'
import { formatMoney } from '../../src/features/meta-ads/format'
import { ACCOUNT, PERIOD_ROW, DAILY_ROWS, AD_ROWS } from './support/fixtures'

const report = normalizeReport({
  account: ACCOUNT,
  datePreset: 'last_7d',
  generatedAt: '2026-11-24T10:00:00.000Z',
  periodRow: PERIOD_ROW,
  dailyRows: DAILY_ROWS,
  adRows: AD_ROWS,
})

const emptyReport = normalizeReport({
  account: ACCOUNT,
  datePreset: 'last_30d',
  generatedAt: 'x',
  periodRow: null,
  dailyRows: [],
  adRows: [],
})

const CONNECTED = { state: 'connected', report: null, isStale: true, lastError: null } as const

test('rangeFromParam maps the query value to a date preset', () => {
  assert.equal(rangeFromParam('30d'), 'last_30d')
  assert.equal(rangeFromParam('7d'), 'last_7d')
  assert.equal(rangeFromParam(undefined), 'last_7d')
  assert.equal(rangeFromParam('x'), 'last_7d')
  assert.equal(rangeFromParam(['30d']), 'last_30d')
})

test('summarySentence builds the dominant-kind sentence', () => {
  assert.deepEqual(summarySentence(report, 'ar'), {
    key: 'adsSummaryMessages',
    values: { spend: formatMoney(700, 'EGP', 'ar'), results: '38', best: 'Reel A' },
  })
})

test('summarySentence returns the no-data sentence for an empty report', () => {
  assert.deepEqual(summarySentence(emptyReport, 'ar'), { key: 'adsSummaryNoData', values: {} })
})

test('shouldAutoSync decides whether the page syncs on open', () => {
  assert.equal(shouldAutoSync(CONNECTED), true)
  assert.equal(shouldAutoSync({ ...CONNECTED, isStale: false }), false)
  assert.equal(shouldAutoSync({ ...CONNECTED, lastError: 'auth_expired' }), false)
  assert.equal(shouldAutoSync({ ...CONNECTED, lastError: 'permission_denied' }), false)
  assert.equal(shouldAutoSync({ ...CONNECTED, lastError: 'provider_error' }), true)
  assert.equal(shouldAutoSync({ state: 'not_connected' }), false)
})

test('reportStatus maps each state to the right surface', () => {
  const cases: { hasReport: boolean; sync: SyncUiState; lastError: string | null; expected: unknown }[] = [
    { hasReport: false, sync: { phase: 'syncing' }, lastError: null, expected: { kind: 'loading' } },
    { hasReport: false, sync: { phase: 'error', code: 'auth_expired' }, lastError: null, expected: { kind: 'reconnect' } },
    { hasReport: false, sync: { phase: 'error', code: 'permission_denied' }, lastError: null, expected: { kind: 'reconnect' } },
    { hasReport: false, sync: { phase: 'error', code: 'provider_error' }, lastError: null, expected: { kind: 'retry' } },
    { hasReport: false, sync: { phase: 'skipped', code: 'cooldown', retryAt: 'X' }, lastError: null, expected: { kind: 'cooldown', retryAt: 'X' } },
    { hasReport: false, sync: { phase: 'idle' }, lastError: 'auth_expired', expected: { kind: 'reconnect' } },
    { hasReport: false, sync: { phase: 'idle' }, lastError: null, expected: { kind: 'retry' } },
    { hasReport: true, sync: { phase: 'syncing' }, lastError: null, expected: { kind: 'report', banner: 'updating' } },
    { hasReport: true, sync: { phase: 'error', code: 'auth_expired' }, lastError: null, expected: { kind: 'report', banner: 'reconnect' } },
    { hasReport: true, sync: { phase: 'error', code: 'provider_error' }, lastError: null, expected: { kind: 'report', banner: 'retry' } },
    { hasReport: true, sync: { phase: 'skipped', code: 'cooldown', retryAt: 'X' }, lastError: null, expected: { kind: 'report', banner: 'cooldown', retryAt: 'X' } },
    { hasReport: true, sync: { phase: 'idle' }, lastError: 'permission_denied', expected: { kind: 'report', banner: 'reconnect' } },
    { hasReport: true, sync: { phase: 'idle' }, lastError: null, expected: { kind: 'report', banner: null } },
  ]
  for (const [index, testCase] of cases.entries()) {
    const actual = reportStatus({ hasReport: testCase.hasReport, sync: testCase.sync, lastError: testCase.lastError })
    assert.deepEqual(actual, testCase.expected, `case ${index + 1}`)
  }
})