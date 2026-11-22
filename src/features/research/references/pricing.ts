/** Price / offer normalization for Egypt: EGP, VAT, delivery, COD, installments, pack size. */
export const EGP_VAT_RATE = 0.14
export const EGP_CURRENCY = 'EGP' as const

export type OfferKind = 'discount' | 'bundle' | 'cashback' | 'installment' | 'loyalty' | 'free_delivery' | 'guarantee' | 'trial'

export interface PriceObservation {
  id: string
  competitor: string
  product: string
  packSize: string | null
  unit: string | null
  listPrice: number
  currency: typeof EGP_CURRENCY
  vatRate: number
  vatIncluded: boolean
  deliveryFee: number
  codAvailable: boolean
  installments: { months: number; monthly: number } | null
  minimumOrder: number | null
  availability: 'in_stock' | 'out_of_stock' | 'unknown'
  channel: string
  governorate: string | null
  capturedAt: string
  validUntil: string | null
  offers: OfferKind[]
  sourceId: string
  rawText: string
}

export interface LandedPrice {
  unitPrice: number
  vatAdded: number
  deliveryFee: number
  total: number
  perUnit: number
  unitLabel: string
  basis: string
}

/** Egyptian price strings: "1,200 جنيه", "EGP 1,200", "1200 EGP", "1.2k جنيه". */
export function parsePriceText(text: string): { amount: number; currency: string } | null {
  const normalized = text.replace(/[٠-٩]/g, char => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char))).replace(/٫/g, '.')
  const kilo = /(\d+(?:[.,]\d+)?)\s*k\b/i.exec(normalized)
  if (kilo) return { amount: Number(kilo[1].replace(',', '.')) * 1000, currency: 'EGP' }
  const match = /(\d[\d,]*(?:\.\d{1,2})?)/.exec(normalized)
  if (!match) return null
  const amount = Number(match[1].replace(/,/g, ''))
  if (!Number.isFinite(amount)) return null
  const currency = /\$|usd|دولار/i.test(normalized) ? 'USD' : /€|eur|يورو/i.test(normalized) ? 'EUR' : 'EGP'
  return { amount, currency }
}

/** Parse "1 kg", "500g", "12 pack", "1 litre" into a comparable unit. */
export function parsePackSize(text: string): { size: number; unit: string; label: string } | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(kg|g|gm|gram|grams|litre|liter|l|ml|pack|packs|pcs|pc|piece|pieces|متر|كجم|جرام|لتر|علبة|شوال|قطعة|حبة)/i.exec(text)
  if (!match) return null
  const size = Number(match[1].replace(',', '.'))
  const rawUnit = match[2].toLowerCase()
  const unit = rawUnit.startsWith('kg') || rawUnit === 'كجم' ? 'kg'
    : rawUnit.startsWith('g') || rawUnit === 'جرام' ? 'g'
    : rawUnit.startsWith('l') || rawUnit === 'لتر' ? 'l'
    : rawUnit === 'ml' ? 'ml'
    : rawUnit.startsWith('m') || rawUnit === 'متر' ? 'm'
    : rawUnit === 'pc' || rawUnit === 'pcs' || rawUnit === 'قطعة' || rawUnit === 'حبة' ? 'unit'
    : 'unit'
  return { size, unit, label: `${size} ${unit}` }
}

export const OFFER_PATTERNS: readonly { kind: OfferKind; pattern: RegExp }[] = Object.freeze([
  { kind: 'discount', pattern: /(?:discount|off|خصم|خصم\s*\d+%|تخفيض|-%)/i },
  { kind: 'bundle', pattern: /(?:bundle|package|عرض|باقة|مع\s*التركيب)/i },
  { kind: 'cashback', pattern: /(?:cashback|كاش باك|استرداد)/i },
  { kind: 'installment', pattern: /(?:installment|بالتقسيط|تقسيط|أقساط|اقساط)/i },
  { kind: 'loyalty', pattern: /(?:loyalty|نقاط|ولاء)/i },
  { kind: 'free_delivery', pattern: /(?:free delivery|شحن مجاني|توصيل مجاني)/i },
  { kind: 'guarantee', pattern: /(?:guarantee|warranty|ضمان)/i },
  { kind: 'trial', pattern: /(?:trial|تجربة|تجربة مجانية)/i },
])

export function classifyOffers(text: string): OfferKind[] {
  return OFFER_PATTERNS.filter(entry => entry.pattern.test(text)).map(entry => entry.kind)
}

/** Egyptian VAT is 14%; a price quoted "including VAT" must not add it again. */
export function vatAmount(price: number, vatRate: number, vatIncluded: boolean): number {
  if (vatIncluded || vatRate <= 0) return 0
  return Math.round(price * vatRate * 100) / 100
}

function perUnit(price: number, pack: { size: number; unit: string } | null): { perUnit: number; unitLabel: string } {
  if (!pack || pack.size <= 0) return { perUnit: price, unitLabel: 'unit' }
  const factor = pack.unit === 'kg' && pack.size >= 1000 ? 1000 : 1
  const base = pack.size / factor
  return { perUnit: Math.round((price / base) * 100) / 100, unitLabel: `per ${pack.unit}` }
}

/** Landed price comparison, never the displayed number. */
export function landedPrice(observation: PriceObservation, pack: { size: number; unit: string } | null = null): LandedPrice {
  const vatAdded = vatAmount(observation.listPrice, observation.vatRate, observation.vatIncluded)
  const total = Math.round((observation.listPrice + vatAdded + observation.deliveryFee) * 100) / 100
  const unit = perUnit(total, pack)
  return {
    unitPrice: observation.listPrice,
    vatAdded,
    deliveryFee: observation.deliveryFee,
    total,
    perUnit: unit.perUnit,
    unitLabel: unit.unitLabel,
    basis: `${observation.vatIncluded ? 'VAT included' : `VAT ${(observation.vatRate * 100).toFixed(0)}% added`} · delivery ${observation.deliveryFee} EGP · ${unit.unitLabel}`,
  }
}

export interface PriceComparisonRow {
  observation: PriceObservation
  landed: LandedPrice
}

/** Compare landed prices with the basis shown; never a bare "cheapest" verdict. */
export function compareLandedPrices(observations: PriceObservation[]): PriceComparisonRow[] {
  return observations
    .map(observation => ({ observation, landed: landedPrice(observation, parsePackSize(`${observation.product} ${observation.packSize ?? ''}`)) }))
    .sort((a, b) => a.landed.perUnit - b.landed.perUnit)
}

/** Comparability gate: two observations may only be compared when the basics match. */
export function comparable(a: PriceObservation, b: PriceObservation): { comparable: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (a.currency !== b.currency) reasons.push('Currency differs')
  if (a.vatIncluded !== b.vatIncluded) reasons.push('VAT treatment differs; use landed price')
  if ((a.packSize ?? '') !== (b.packSize ?? '')) reasons.push('Pack size differs')
  if ((a.governorate ?? '') !== (b.governorate ?? '')) reasons.push('Geography differs')
  if (a.validUntil && b.validUntil && a.validUntil !== b.validUntil) reasons.push('Validity windows differ')
  return { comparable: reasons.length === 0, reasons }
}

/** Missing is not zero: an unknown price must never become 0. */
export function normalizePriceObservation(input: Partial<PriceObservation> & { listPrice: number; product: string; competitor: string; capturedAt: string }): PriceObservation {
  return {
    id: input.id ?? `price:${input.competitor}:${input.product}`,
    competitor: input.competitor,
    product: input.product,
    packSize: input.packSize ?? null,
    unit: input.unit ?? null,
    listPrice: input.listPrice,
    currency: EGP_CURRENCY,
    vatRate: input.vatRate ?? EGP_VAT_RATE,
    vatIncluded: input.vatIncluded ?? false,
    deliveryFee: input.deliveryFee ?? 0,
    codAvailable: input.codAvailable ?? false,
    installments: input.installments ?? null,
    minimumOrder: input.minimumOrder ?? null,
    availability: input.availability ?? 'unknown',
    channel: input.channel ?? 'website',
    governorate: input.governorate ?? null,
    capturedAt: input.capturedAt,
    validUntil: input.validUntil ?? null,
    offers: input.offers ?? [],
    sourceId: input.sourceId ?? '',
    rawText: input.rawText ?? '',
  }
}