import { test } from 'node:test'
import assert from 'node:assert/strict'

import { primaryResult, resultForKind } from '../../src/features/meta-ads/objective-map'

const M = 'onsite_conversion.messaging_conversation_started_7d'

test('primaryResult picks messages for engagement and messaging objectives', () => {
  assert.deepEqual(primaryResult('OUTCOME_ENGAGEMENT', [{ action_type: M, value: '12' }], 0), { kind: 'messages', value: 12 })
  assert.deepEqual(primaryResult('MESSAGES', [{ action_type: M, value: '12' }], 0), { kind: 'messages', value: 12 })
})

test('primaryResult picks leads by the first matching type, not a sum', () => {
  assert.deepEqual(
    primaryResult('OUTCOME_LEADS', [{ action_type: 'lead', value: '5' }, { action_type: 'onsite_conversion.lead_grouped', value: '5' }], 0),
    { kind: 'leads', value: 5 },
  )
  assert.deepEqual(
    primaryResult('OUTCOME_LEADS', [{ action_type: 'onsite_conversion.lead_grouped', value: '3' }], 0),
    { kind: 'leads', value: 3 },
  )
})

test('primaryResult picks purchases for sales objectives', () => {
  assert.deepEqual(primaryResult('OUTCOME_SALES', [{ action_type: 'purchase', value: '2' }], 0), { kind: 'purchases', value: 2 })
})

test('primaryResult falls back to messaging for sales without a purchase', () => {
  assert.deepEqual(primaryResult('OUTCOME_SALES', [{ action_type: M, value: '4' }], 0), { kind: 'messages', value: 4 })
})

test('primaryResult falls back to clicks when no action matches', () => {
  assert.deepEqual(primaryResult('OUTCOME_TRAFFIC', undefined, 40), { kind: 'clicks', value: 40 })
  assert.deepEqual(primaryResult(null, undefined, 7), { kind: 'clicks', value: 7 })
})

test('primaryResult coerces a non-numeric value to zero', () => {
  assert.deepEqual(primaryResult('OUTCOME_ENGAGEMENT', [{ action_type: M, value: 'abc' }], 0), { kind: 'messages', value: 0 })
})

test('resultForKind reads the matching action or falls back to clicks', () => {
  assert.equal(resultForKind('messages', [{ action_type: M, value: '38' }], 300), 38)
  assert.equal(resultForKind('leads', [{ action_type: M, value: '38' }], 300), 0)
  assert.equal(resultForKind('clicks', [{ action_type: M, value: '38' }], 300), 300)
  assert.equal(resultForKind('purchases', [{ action_type: 'omni_purchase', value: '6' }], 0), 6)
})