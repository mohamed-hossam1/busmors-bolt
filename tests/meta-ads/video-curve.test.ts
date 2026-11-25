import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CURVE_SECONDS, curveLabel, toVideoCurve } from '../../src/features/meta-ads/video-curve'

const P = [100, 72, 58, 49, 43, 39, 36, 33, 31, 29, 27, 26, 25, 24, 23, 22, 19, 17, 15, 12, 10, 8]

test('CURVE_SECONDS is the non-linear 22-point axis', () => {
  assert.deepEqual(CURVE_SECONDS, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 40, 50, 60])
})

test('curveLabel formats seconds as m:ss with a 1:00+ tail', () => {
  assert.equal(curveLabel(0), '0:00')
  assert.equal(curveLabel(15), '0:15')
  assert.equal(curveLabel(20), '0:20')
  assert.equal(curveLabel(30), '0:30')
  assert.equal(curveLabel(40), '0:40')
  assert.equal(curveLabel(60), '1:00+')
})

test('toVideoCurve maps percent-mode values onto the axis', () => {
  const points = toVideoCurve([{ action_type: 'video_view', value: P }])
  assert.equal(points?.length, 22)
  assert.deepEqual(points?.[0], { second: 0, label: '0:00', percent: 100 })
  assert.deepEqual(points?.[16], { second: 20, label: '0:20', percent: 19 })
  assert.deepEqual(points?.[21], { second: 60, label: '1:00+', percent: 8 })
})

test('toVideoCurve normalises count-mode values against the first point', () => {
  const counts = [2000, 1000, ...Array.from({ length: 20 }, () => 500)]
  const points = toVideoCurve([{ action_type: 'video_view', value: counts }])
  assert.equal(points?.[0].percent, 100)
  assert.equal(points?.[1].percent, 50)
  assert.equal(points?.[2].percent, 25)
})

test('toVideoCurve returns null for malformed or missing curves', () => {
  const short = Array.from({ length: 21 }, (_, i) => i + 1)
  assert.equal(toVideoCurve([{ action_type: 'video_view', value: short }]), null)
  assert.equal(toVideoCurve(undefined), null)
  assert.equal(toVideoCurve([]), null)
  assert.equal(toVideoCurve([{ action_type: 'video_view' }]), null)
  const zeroFirst = [0, 200, ...Array.from({ length: 20 }, () => 500)]
  assert.equal(toVideoCurve([{ action_type: 'video_view', value: zeroFirst }]), null)
})