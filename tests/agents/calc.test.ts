import test from 'node:test'
import assert from 'node:assert/strict'
import { calculate, relativeChange, percentagePointChange, inspectData, groupSum, dedupeRows } from '../../src/server/employee/calc.ts'

function approx(actual: number, expected: number, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} ≈ ${expected}`)
}

test('spec §6.9 fixture oracles — Week A', () => {
  const ctr = calculate('ctr', { values: { clicks: 400, impressions: 20000 } })
  assert.equal(ctr.ok, true)
  if (ctr.ok) approx(ctr.value, 2)
  const cpc = calculate('cpc', { values: { spend: 1600, clicks: 400 } })
  if (cpc.ok) approx(cpc.value, 4)
  const cpi = calculate('cost_per_result', { values: { spend: 1600, results: 100 } })
  if (cpi.ok) approx(cpi.value, 16)
  const i2c = calculate('conversion_rate', { values: { conversions: 40, eligible: 100 } })
  if (i2c.ok) approx(i2c.value, 40)
  const c2d = calculate('delivery_rate', { values: { delivered: 32, confirmed: 40 } })
  if (c2d.ok) approx(c2d.value, 80)
  const cpd = calculate('cost_per_result', { values: { spend: 1600, results: 32 } })
  if (cpd.ok) approx(cpd.value, 50)
  const roas = calculate('roas', { values: { attributedValue: 8000, spend: 1600 } })
  if (roas.ok) approx(roas.value, 5)
})

test('spec §6.9 fixture oracles — Week B', () => {
  const ctr = calculate('ctr', { values: { clicks: 480, impressions: 24000 } })
  if (ctr.ok) approx(ctr.value, 2)
  const cpc = calculate('cpc', { values: { spend: 1920, clicks: 480 } })
  if (cpc.ok) approx(cpc.value, 4)
  const cpi = calculate('cost_per_result', { values: { spend: 1920, results: 140 } })
  if (cpi.ok) approx(cpi.value, 13.7142857, 1e-4)
  const i2c = calculate('conversion_rate', { values: { conversions: 42, eligible: 140 } })
  if (i2c.ok) approx(i2c.value, 30)
  const c2d = calculate('delivery_rate', { values: { delivered: 28, confirmed: 42 } })
  if (c2d.ok) approx(c2d.value, 66.6667, 1e-3)
  const cpd = calculate('cost_per_result', { values: { spend: 1920, results: 28 } })
  if (cpd.ok) approx(cpd.value, 68.5714, 1e-3)
  const roas = calculate('roas', { values: { attributedValue: 7000, spend: 1920 } })
  if (roas.ok) approx(roas.value, 3.6458, 1e-3)
})

test('delivered orders down 12.5%', () => {
  const change = relativeChange(32, 28)
  assert.equal(change.ok, true)
  if (change.ok) approx(change.value, -12.5)
})

test('undefined denominator and null handling never produce Infinity/NaN', () => {
  const zero = calculate('ctr', { values: { clicks: 5, impressions: 0 } })
  assert.equal(zero.ok, false)
  const missing = calculate('cpc', { values: { spend: 10 } })
  assert.equal(missing.ok, false)
  if (!missing.ok) assert.match(missing.error, /missing input/)
  const nullv = calculate('roas', { values: { attributedValue: null, spend: 100 } })
  assert.equal(nullv.ok, false)
})

test('percentage-point vs relative change are distinct', () => {
  const pp = percentagePointChange(40, 30)
  if (pp.ok) approx(pp.value, -10)
  const rel = relativeChange(40, 30)
  if (rel.ok) approx(rel.value, -25)
})

test('inspectData reports nulls and numeric stats without dividing by zero', () => {
  const summary = inspectData([
    { week: 'A', orders: 40 },
    { week: 'B', orders: 28 },
    { week: 'C', orders: null },
  ])
  assert.equal(summary.rowCount, 3)
  const orders = summary.columns.find((c) => c.column === 'orders')
  assert.ok(orders)
  assert.equal(orders!.nulls, 1)
  assert.equal(orders!.count, 2)
  assert.equal(orders!.numeric, true)
  if (orders!.sum !== undefined) approx(orders!.sum, 68)
})

test('groupSum and dedupeRows are deterministic', () => {
  const grouped = groupSum([{ w: 'A', v: 1 }, { w: 'A', v: 2 }, { w: 'B', v: 3 }], 'w', 'v')
  assert.deepEqual(grouped, { A: 3, B: 3 })
  const deduped = dedupeRows([{ id: 1, v: 'x' }, { id: 1, v: 'y' }, { id: 2, v: 'z' }], 'id')
  assert.equal(deduped.length, 2)
  assert.equal(deduped[0].v, 'x')
})