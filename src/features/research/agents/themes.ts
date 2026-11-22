/** Theme vocabulary shared by audience and positioning tracks. */
export const THEME_PATTERNS: readonly { theme: string; pattern: RegExp }[] = Object.freeze([
  { theme: 'price', pattern: /(?:price|cost|expensive|غالي|سعر|أسعار|بكام|مكلف)/i },
  { theme: 'trust', pattern: /(?:trust|reliable|doubt|مضمون|ثقة|خوف|نصب)/i },
  { theme: 'delivery', pattern: /(?:delivery|shipping|توصيل|شحن|استلام)/i },
  { theme: 'quality', pattern: /(?:quality|break|broke|جودة|كسر|مكسور)/i },
  { theme: 'speed', pattern: /(?:fast|slow|quick|سريع|بطيء|تأخير)/i },
  { theme: 'guarantee', pattern: /(?:guarantee|warranty|ضمان)/i },
])

export function themeOfPublicText(text: string): string {
  return THEME_PATTERNS.find(entry => entry.pattern.test(text))?.theme ?? 'other'
}

export function themeCounts(quotes: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const quote of quotes) {
    const theme = themeOfPublicText(quote)
    counts[theme] = (counts[theme] ?? 0) + 1
  }
  return counts
}