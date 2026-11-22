import 'server-only'
import en from './dictionaries/en.json'
import ar from './dictionaries/ar.json'
import { hasLocale, type Dictionary, type Locale } from '@/lib/i18n'

export { locales, defaultLocale, hasLocale, type Locale } from '@/lib/i18n'

const dictionaries: Record<Locale, () => Dictionary> = {
  en: () => en,
  ar: () => ar as unknown as Dictionary,
}

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]()
}

export function getDictionarySafe(locale: string): Dictionary | null {
  return hasLocale(locale) ? dictionaries[locale]() : null
}