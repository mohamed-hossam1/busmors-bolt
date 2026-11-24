export function localeTag(locale: 'ar' | 'en'): string {
  return locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en'
}

export function formatMoney(value: number, currency: string, locale: 'ar' | 'en'): string {
  try {
    return new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  } catch {
    return value.toFixed(2) + ' ' + currency
  }
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en').format(Math.round(value))
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? '—' : (ratio * 100).toFixed(2) + '%'
}