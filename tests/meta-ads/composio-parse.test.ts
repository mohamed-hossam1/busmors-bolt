import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  unwrapRows,
  nextCursor,
  parseAdAccounts,
  metaErrorCode,
  insightsArguments,
  listAccountsArguments,
} from '../../src/features/meta-ads/composio-parse'

test('unwrapRows reads rows from the Graph data shape', () => {
  assert.deepEqual(unwrapRows({ data: [{ a: 1 }], paging: {} }), [{ a: 1 }])
})

test('unwrapRows reads rows from the response_data shape', () => {
  assert.deepEqual(unwrapRows({ response_data: { data: [{ a: 1 }] } }), [{ a: 1 }])
})

test('unwrapRows reads rows from a nested data.data shape', () => {
  assert.deepEqual(unwrapRows({ data: { data: [{ a: 1 }] } }), [{ a: 1 }])
})

test('unwrapRows returns an empty array for unknown shapes', () => {
  assert.deepEqual(unwrapRows(undefined), [])
  assert.deepEqual(unwrapRows({ data: 'x' }), [])
})

test('nextCursor reads the cursor after a next link', () => {
  assert.equal(nextCursor({ paging: { next: 'u', cursors: { after: 'c1' } } }), 'c1')
})

test('nextCursor reads the cursor from the response_data shape', () => {
  assert.equal(nextCursor({ response_data: { paging: { next: 'u', cursors: { after: 'c2' } } } }), 'c2')
})

test('nextCursor returns undefined when next is missing', () => {
  assert.equal(nextCursor({ paging: { cursors: { after: 'c1' } } }), undefined)
})

test('parseAdAccounts normalises ids, names and drops invalid rows', () => {
  const input = [
    { id: 'act_1', name: 'A', currency: 'EGP', timezone_name: 'Africa/Cairo', account_status: 1 },
    { id: '123', currency: 'USD', timezone_name: 'UTC', account_status: 2 },
    { name: 'no id', currency: 'EGP', timezone_name: 'UTC' },
    { id: 'act_9', currency: 'egp', timezone_name: 'UTC' },
  ]
  assert.deepEqual(parseAdAccounts(input), [
    { id: 'act_1', name: 'A', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true },
    { id: 'act_123', name: 'act_123', currency: 'USD', timezoneName: 'UTC', active: false },
  ])
})

test('metaErrorCode maps Meta error messages to codes', () => {
  assert.equal(metaErrorCode('Error validating access token: Session has expired'), 'auth_expired')
  assert.equal(metaErrorCode('(#200) Requires ads_read permission'), 'permission_denied')
  assert.equal(metaErrorCode('(#100) Invalid parameter'), 'invalid_request')
  assert.equal(metaErrorCode('boom'), 'provider_error')
})

test('insightsArguments builds the verified argument shape', () => {
  const base = insightsArguments(
    { adAccountId: 'act_1', level: 'ad', datePreset: 'last_7d', daily: false, fields: ['spend', 'ad_id'] },
    undefined,
  )
  assert.deepEqual(base, { object_id: 'act_1', level: 'ad', date_preset: 'last_7d', fields: 'spend,ad_id', limit: 100 })
  assert.equal(typeof base.fields, 'string')
})

test('insightsArguments adds time_increment as a number for daily queries', () => {
  const daily = insightsArguments(
    { adAccountId: 'act_1', level: 'account', datePreset: 'last_7d', daily: true, fields: ['spend'] },
    undefined,
  )
  assert.equal(daily.time_increment, 1)
  assert.equal(typeof daily.fields, 'string')
})

test('insightsArguments adds the paging cursor after when given', () => {
  const paged = insightsArguments(
    { adAccountId: 'act_1', level: 'ad', datePreset: 'last_7d', daily: false, fields: ['spend'] },
    'c1',
  )
  assert.equal(paged.after, 'c1')
  assert.equal(typeof paged.fields, 'string')
})

test('listAccountsArguments takes no arguments and sends comma-separated fields', () => {
  assert.deepEqual(listAccountsArguments(), { fields: 'id,name,currency,timezone_name,account_status', limit: 100 })
  assert.equal(listAccountsArguments.length, 0)
})