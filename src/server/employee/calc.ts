/**
 * Deterministic, safe numeric + data-analysis primitives (spec §6.4/§6.5).
 *
 * These are NOT a model and NOT a generic evaluator. They perform typed numeric
 * operations over already-validated inputs with explicit null/zero handling and
 * provenance. No eval, no arbitrary code, no filesystem. The Marketing Analyst
 * uses them via the tool registry; tests pin the exact fixture oracles from
 * spec §6.9 so a wrong implementation cannot pass.
 *
 * Every result carries its inputs and formula so it is reproducible and auditable.
 */

export interface CalcInput {
  /** Named numeric inputs (already validated as finite numbers or null). */
  values: Record<string, number | null>
}

export interface CalcProvenance {
  formula: string
  inputs: Record<string, number | null>
  result: number | null
  unit?: string
  note?: string
}

export type CalcResult =
  | { ok: true; value: number; provenance: CalcProvenance }
  | { ok: false; error: string; provenance: CalcProvenance }

function provenance(formula: string, inputs: Record<string, number | null>, result: number | null, unit?: string, note?: string): CalcProvenance {
  return { formula, inputs, result, unit, note }
}

function requireNumber(inputs: Record<string, number | null>, key: string): number | string {
  const value = inputs[key]
  if (value === null || value === undefined) return `missing input: ${key}`
  if (!Number.isFinite(value)) return `non-finite input: ${key}`
  return value
}

/**
 * A named formula evaluator. Each formula declares its required inputs and a pure
 * compute function. Division by an undefined/zero denominator yields a typed
 * error, never Infinity/NaN.
 */
export type FormulaName =
  | 'ctr'
  | 'cpc'
  | 'cpm'
  | 'cost_per_result'
  | 'conversion_rate'
  | 'roas'
  | 'click_through_rate'
  | 'delivery_rate'
  | 'relative_change'
  | 'percentage_point_change'

interface FormulaDef {
  inputs: string[]
  unit: string
  compute: (v: Record<string, number>) => number | string
}

const FORMULAS: Record<FormulaName, FormulaDef> = {
  // CTR = clicks / impressions * 100
  ctr: { inputs: ['clicks', 'impressions'], unit: '%', compute: (v) => (v.impressions === 0 ? 'undefined denominator: impressions=0' : (v.clicks / v.impressions) * 100) },
  click_through_rate: { inputs: ['clicks', 'impressions'], unit: '%', compute: (v) => (v.impressions === 0 ? 'undefined denominator: impressions=0' : (v.clicks / v.impressions) * 100) },
  // CPC = spend / clicks
  cpc: { inputs: ['spend', 'clicks'], unit: 'currency', compute: (v) => (v.clicks === 0 ? 'undefined denominator: clicks=0' : v.spend / v.clicks) },
  // CPM = spend / impressions * 1000
  cpm: { inputs: ['spend', 'impressions'], unit: 'currency', compute: (v) => (v.impressions === 0 ? 'undefined denominator: impressions=0' : (v.spend / v.impressions) * 1000) },
  // cost per result = spend / results
  cost_per_result: { inputs: ['spend', 'results'], unit: 'currency', compute: (v) => (v.results === 0 ? 'undefined denominator: results=0' : v.spend / v.results) },
  // conversion rate = conversions / eligible * 100
  conversion_rate: { inputs: ['conversions', 'eligible'], unit: '%', compute: (v) => (v.eligible === 0 ? 'undefined denominator: eligible=0' : (v.conversions / v.eligible) * 100) },
  // ROAS = attributed value / spend
  roas: { inputs: ['attributedValue', 'spend'], unit: 'x', compute: (v) => (v.spend === 0 ? 'undefined denominator: spend=0' : v.attributedValue / v.spend) },
  // delivery rate = delivered / confirmed * 100
  delivery_rate: { inputs: ['delivered', 'confirmed'], unit: '%', compute: (v) => (v.confirmed === 0 ? 'undefined denominator: confirmed=0' : (v.delivered / v.confirmed) * 100) },
  // relative change = (next - previous) / previous * 100
  relative_change: { inputs: ['previous', 'next'], unit: '%', compute: (v) => (v.previous === 0 ? 'undefined denominator: previous=0' : ((v.next - v.previous) / v.previous) * 100) },
  // percentage point change = next - previous
  percentage_point_change: { inputs: ['previous', 'next'], unit: 'pp', compute: (v) => v.next - v.previous },
}

export function calculate(formula: FormulaName, input: CalcInput): CalcResult {
  const def = FORMULAS[formula]
  if (!def) return { ok: false, error: `unknown formula: ${formula}`, provenance: provenance(String(formula), input.values, null) }
  const values: Record<string, number> = {}
  const rawInputs: Record<string, number | null> = {}
  for (const key of def.inputs) {
    rawInputs[key] = input.values[key] ?? null
    const n = requireNumber(input.values, key)
    if (typeof n === 'string') {
      return { ok: false, error: n, provenance: provenance(formula, rawInputs, null, def.unit) }
    }
    values[key] = n
  }
  const result = def.compute(values)
  if (typeof result === 'string') {
    return { ok: false, error: result, provenance: provenance(formula, rawInputs, null, def.unit) }
  }
  if (!Number.isFinite(result)) {
    return { ok: false, error: 'non-finite result', provenance: provenance(formula, rawInputs, null, def.unit) }
  }
  return { ok: true, value: result, provenance: provenance(formula, rawInputs, result, def.unit) }
}

/** Relative change in percent: (next - prev) / prev * 100. */
export function relativeChange(previous: number, next: number): CalcResult {
  const inputs = { previous, next }
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return { ok: false, error: 'non-finite input', provenance: provenance('relative_change', inputs, null, '%') }
  if (previous === 0) return { ok: false, error: 'undefined denominator: previous=0', provenance: provenance('relative_change', inputs, null, '%') }
  const value = ((next - previous) / previous) * 100
  return { ok: true, value, provenance: provenance('relative_change', inputs, value, '%') }
}

/** Absolute (percentage-point) difference: next - previous. */
export function percentagePointChange(previous: number, next: number): CalcResult {
  const inputs = { previous, next }
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return { ok: false, error: 'non-finite input', provenance: provenance('percentage_point_change', inputs, null, 'pp') }
  const value = next - previous
  return { ok: true, value, provenance: provenance('percentage_point_change', inputs, value, 'pp') }
}

// ---------------------------------------------------------------------------
// Structured data analysis (typed operations, no eval, bounded).
// ---------------------------------------------------------------------------

export interface DataRow {
  [key: string]: string | number | boolean | null
}

export interface DataColumnSummary {
  column: string
  count: number
  nulls: number
  numeric: boolean
  sum?: number
  min?: number
  max?: number
  mean?: number
}

export interface DataSummary {
  rowCount: number
  columns: DataColumnSummary[]
}

function isNumericColumn(rows: DataRow[], column: string): boolean {
  let sawNumber = false
  for (const row of rows) {
    const value = row[column]
    if (value === null || value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) return false
    sawNumber = true
  }
  return sawNumber
}

/** Inspect schema and per-column stats. Bounded; never throws on empty input. */
export function inspectData(rows: DataRow[]): DataSummary {
  const columns = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row)) columns.add(key)
  const summaries: DataColumnSummary[] = []
  for (const column of columns) {
    let count = 0
    let nulls = 0
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const row of rows) {
      const value = row[column]
      if (value === null || value === undefined) { nulls += 1; continue }
      count += 1
      if (typeof value === 'number' && Number.isFinite(value)) {
        sum += value
        if (value < min) min = value
        if (value > max) max = value
      }
    }
    const numeric = isNumericColumn(rows, column)
    const summary: DataColumnSummary = { column, count, nulls, numeric }
    if (numeric && count > 0) {
      summary.sum = sum
      summary.min = min
      summary.max = max
      summary.mean = sum / count
    }
    summaries.push(summary)
  }
  return { rowCount: rows.length, columns: summaries }
}

/** Filter rows where a column equals a value. */
export function filterRows(rows: DataRow[], column: string, equals: string | number | boolean): DataRow[] {
  return rows.filter((row) => row[column] === equals)
}

/** Group rows by a column and sum a numeric column (nulls ignored). */
export function groupSum(rows: DataRow[], groupBy: string, sumColumn: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'null')
    const value = row[sumColumn]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    out[key] = (out[key] ?? 0) + value
  }
  return out
}

/** Deduplicate rows by a stable key column; first occurrence wins. */
export function dedupeRows(rows: DataRow[], keyColumn: string): DataRow[] {
  const seen = new Set<string>()
  const out: DataRow[] = []
  for (const row of rows) {
    const key = String(row[keyColumn])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

/** Sum a numeric column, returning null when there are no numeric values. */
export function columnSum(rows: DataRow[], column: string): number | null {
  let sum = 0
  let seen = false
  for (const row of rows) {
    const value = row[column]
    if (typeof value === 'number' && Number.isFinite(value)) { sum += value; seen = true }
  }
  return seen ? sum : null
}