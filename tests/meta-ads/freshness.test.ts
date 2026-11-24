import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decideSync, DEFAULT_SYNC_CONFIG } from '../../src/features/meta-ads/freshness'

const NOW = new Date('2026-11-24T12:00:00.000Z')
const h = (n: number) => new Date(NOW.getTime() - n * 3600_000)
const m = (n: number) => new Date(NOW.getTime() - n * 60_000)

test('no cache, auto syncs', () => {
  const decision = decideSync({ manual: false, fetchedAt: null, lastManualSyncAt: null }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'sync' })
})

test('fetched 1 h ago, auto skips as fresh', () => {
  const decision = decideSync({ manual: false, fetchedAt: h(1), lastManualSyncAt: null }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'skip', reason: 'fresh' })
})

test('fetched 4 h 59 m ago, auto skips as fresh', () => {
  const decision = decideSync({ manual: false, fetchedAt: m(299), lastManualSyncAt: null }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'skip', reason: 'fresh' })
})

test('fetched exactly 5 h ago, auto syncs', () => {
  const decision = decideSync({ manual: false, fetchedAt: h(5), lastManualSyncAt: null }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'sync' })
})

test('fetched 6 h ago, auto syncs', () => {
  const decision = decideSync({ manual: false, fetchedAt: h(6), lastManualSyncAt: null }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'sync' })
})

test('manual, never refreshed syncs because manual ignores freshness', () => {
  const decision = decideSync({ manual: true, fetchedAt: m(1), lastManualSyncAt: null }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'sync' })
})

test('manual, last manual 10 min ago skips on cooldown', () => {
  const decision = decideSync({ manual: true, fetchedAt: m(1), lastManualSyncAt: m(10) }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'skip', reason: 'cooldown', retryAt: '2026-11-24T12:20:00.000Z' })
})

test('manual, last manual exactly 30 min ago syncs', () => {
  const decision = decideSync({ manual: true, fetchedAt: m(1), lastManualSyncAt: m(30) }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'sync' })
})

test('auto, last manual 1 min ago, cache stale syncs because cooldown applies only to manual', () => {
  const decision = decideSync({ manual: false, fetchedAt: h(6), lastManualSyncAt: m(1) }, NOW, DEFAULT_SYNC_CONFIG)
  assert.deepEqual(decision, { action: 'sync' })
})