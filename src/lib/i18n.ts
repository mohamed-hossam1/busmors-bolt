import en from '../app/[lang]/dictionaries/en.json'

export const locales = ['ar', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'ar'

export const LOCALE_COOKIE = 'BUSMORA_LOCALE'

export type Dictionary = typeof en
export type AppKey = keyof Dictionary['app']
export type TranslationKey = AppKey

export function hasLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export function isRtl(locale: string): boolean {
  return locale === 'ar'
}

export function dirForLocale(locale: string): 'ltr' | 'rtl' {
  return isRtl(locale) ? 'rtl' : 'ltr'
}

export function format(template: string, values?: Record<string, string | number>): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])))
}

export function stripLocale(pathname: string): string {
  const stripped = pathname.replace(/^\/(en|ar)(?=\/|$)/, '')
  return stripped === '' ? '/' : stripped
}

export function localizePath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path
  const hashIndex = path.indexOf('#')
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : ''
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path
  const queryIndex = withoutHash.indexOf('?')
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex) : ''
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  const stripped = stripLocale(pathname)
  const localized = stripped === '/' ? `/${locale}` : `/${locale}${stripped}`
  return localized + query + hash
}