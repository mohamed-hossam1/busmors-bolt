import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatMoney, formatCount, formatPercent } from '../../src/features/meta-ads/format'

test('formatMoney renders the amount and the currency code', () => {
  const en = formatMoney(1234.5, 'EGP', 'en')
  assert.ok(en.includes('1,234.50'))
  assert.ok(en.includes('EGP'))
})

test('formatMoney uses Latin digits for Arabic', () => {
  assert.ok(formatMoney(1234.5, 'EGP', 'ar').includes('1,234.50'))
})

test('formatMoney falls back when the currency is invalid', () => {
  assert.equal(formatMoney(10, 'XXX1', 'en'), '10.00 XXX1')
})

test('formatPercent renders a ratio or an em dash', () => {
  assert.equal(formatPercent(0.0345), '3.45%')
  assert.equal(formatPercent(null), '—')
})

test('formatCount groups and rounds to an integer', () => {
  assert.equal(formatCount(12345), '12,345')
  assert.equal(formatCount(12.6), '13')
})