import { normalizeText } from './lexicon'

/** Egyptian geography: Greater Cairo is never "all Egypt". */
export const EGYPT_GOVERNORATES: readonly string[] = Object.freeze([
  'Cairo', 'Giza', 'Qalyubia', 'Alexandria', 'Beheira', 'Kafr El Sheikh', 'Gharbia', 'Monufia',
  'Dakahlia', 'Sharqia', 'Damietta', 'Port Said', 'Ismailia', 'Suez', 'Fayoum', 'Beni Suef',
  'Minya', 'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan', 'Red Sea', 'New Valley', 'Matrouh',
  'North Sinai', 'South Sinai',
])

export const GREATER_CAIRO: readonly string[] = Object.freeze(['Cairo', 'Giza', 'Qalyubia'])
export const DELTA_REGION: readonly string[] = Object.freeze(['Beheira', 'Kafr El Sheikh', 'Gharbia', 'Monufia', 'Dakahlia', 'Sharqia', 'Damietta'])
export const UPPER_EGYPT: readonly string[] = Object.freeze(['Fayoum', 'Beni Suef', 'Minya', 'Asyut', 'Sohag', 'Qena', 'Luxor', 'Aswan'])
export const CHANNEL_COAST: readonly string[] = Object.freeze(['Alexandria', 'Beheira', 'Matrouh'])
export const CANAL_REGION: readonly string[] = Object.freeze(['Ismailia', 'Port Said', 'Suez'])

const ALIASES: Readonly<Record<string, string>> = Object.freeze({
  cairo: 'Cairo', 'القاهرة': 'Cairo', maadi: 'Cairo', nasr_city: 'Cairo', 'مدينة نصر': 'Cairo', heliopolis: 'Cairo',
  giza: 'Giza', 'الجيزة': 'Giza', 'الهرم': 'Giza', ' الشيخ زايد': 'Giza', sheikh_zayed: 'Giza', '6 اكتوبر': 'Giza', october: 'Giza',
  qalyubia: 'Qalyubia', 'القليوبية': 'Qalyubia', shubra: 'Qalyubia', 'شبرا الخيمة': 'Qalyubia',
  alexandria: 'Alexandria', alex: 'Alexandria', 'الإسكندرية': 'Alexandria', smouha: 'Alexandria',
  'مصر': 'Egypt',
})

export function normalizeGovernorate(value: string): string | null {
  const key = normalizeText(value)
  for (const [alias, governorate] of Object.entries(ALIASES)) {
    if (key === normalizeText(alias) || key.includes(normalizeText(alias))) return governorate
  }
  const exact = EGYPT_GOVERNORATES.find(name => normalizeText(name) === key)
  return exact ?? null
}

export interface GeographyScope {
  label: string
  governorates: string[]
  egyptWide: boolean
}

/** Derive an honest scope from the brief instead of assuming nationwide coverage. */
export function scopeFromGovernorates(governorates: string[], businessDescription = ''): GeographyScope {
  const normalized = [...new Set(governorates.map(normalizeGovernorate).filter((name): name is string => !!name))]
  if (!normalized.length) {
    const mentioned = EGYPT_GOVERNORATES.filter(name => businessDescription.toLowerCase().includes(name.toLowerCase()))
    if (mentioned.length === 0) return { label: 'Egypt (unverified scope)', governorates: [], egyptWide: false }
    return { label: `Egypt — ${mentioned.join(', ')}`, governorates: mentioned, egyptWide: mentioned.length === EGYPT_GOVERNORATES.length }
  }
  const egyptWide = normalized.length === EGYPT_GOVERNORATES.length
  return { label: egyptWide ? 'Egypt (all governorates)' : `Egypt — ${normalized.join(', ')}`, governorates: normalized, egyptWide }
}

export function isGreaterCairo(governorate: string): boolean {
  return GREATER_CAIRO.includes(normalizeGovernorate(governorate) ?? '')
}

/** Claims about "Egypt" from Greater Cairo data are flagged, not silently accepted. */
export function checkGeographyGeneralization(claimGeography: string | null, sourceGeography: string | null): { ok: boolean; reason: string | null } {
  if (!claimGeography) return { ok: true, reason: null }
  const claim = normalizeText(claimGeography)
  const source = normalizeText(sourceGeography ?? '')
  const nationwide = /(?:all\s*egypt|مصر\s*كلها|national|nationwide)/.test(claim)
  if (nationwide && source && /cairo|giza|قاهرة|جيزة/.test(source)) {
    return { ok: false, reason: 'A nationwide claim rests on Greater Cairo evidence. Narrow the claim or widen the sample.' }
  }
  if (nationwide && !source) return { ok: false, reason: 'Nationwide claim without a documented geography.' }
  return { ok: true, reason: null }
}

export interface CoverageNote {
  scope: GeographyScope
  gaps: string[]
}

export function geographyCoverage(scope: GeographyScope, coveredGovernorates: string[]): CoverageNote {
  const covered = new Set(coveredGovernorates.map(normalizeGovernorate).filter((name): name is string => !!name))
  const gaps: string[] = []
  if (scope.egyptWide) {
    const missing = EGYPT_GOVERNORATES.filter(name => !covered.has(name))
    if (missing.length) gaps.push(`No evidence for ${missing.length} governorates, including ${missing.slice(0, 4).join(', ')}.`)
  } else {
    const missingInScope = scope.governorates.filter(name => !covered.has(name))
    if (missingInScope.length) gaps.push(`Scope includes ${missingInScope.join(', ')} but no source was captured there.`)
    gaps.push('Greater Cairo data is not evidence about the Delta, Upper Egypt or the Canal region.')
  }
  if (covered.size === 0) gaps.push('No geography captured; every location claim is unverified.')
  return { scope, gaps }
}