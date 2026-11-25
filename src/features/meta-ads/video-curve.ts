import { num } from './contracts'
import type { VideoCurvePoint } from './contracts'

export const CURVE_SECONDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 40, 50, 60]

export function curveLabel(second: number): string {
  return second >= 60 ? '1:00+' : '0:' + String(second).padStart(2, '0')
}

export function toVideoCurve(raw: unknown): VideoCurvePoint[] | null {
  const first = Array.isArray(raw) ? raw[0] : undefined
  const values = (first as { value?: unknown } | undefined)?.value
  if (!Array.isArray(values) || values.length !== 22) return null
  const nums = (values as unknown[]).map((value) => num(value))
  const countMode = nums.some((value) => value > 100)
  let percents: number[]
  if (countMode) {
    if (nums[0] <= 0) return null
    percents = nums.map((value) => Math.round((value / nums[0]) * 1000) / 10)
  } else {
    percents = nums.map((value) => Math.round(value * 10) / 10)
  }
  return CURVE_SECONDS.map((second, i) => ({ second, label: curveLabel(second), percent: percents[i] }))
}