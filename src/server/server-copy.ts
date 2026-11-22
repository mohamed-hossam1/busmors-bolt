import 'server-only'
import { cookies } from 'next/headers'
import en from '../app/[lang]/dictionaries/en.json'
import ar from '../app/[lang]/dictionaries/ar.json'
import { defaultLocale, format, hasLocale, LOCALE_COOKIE, type AppKey } from '../lib/i18n'

export type ServerTranslate = (key: AppKey, values?: Record<string, string | number>) => string

/** Owner-facing copy for server actions, in the locale the owner chose (cookie), falling back to English. */
export async function serverTranslator(): Promise<ServerTranslate> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = cookie && hasLocale(cookie) ? cookie : defaultLocale
  const active = (locale === 'ar' ? ar.app : en.app) as Record<string, string>
  const fallback = en.app as Record<string, string>
  return (key, values) => format(active[key] ?? fallback[key] ?? String(key), values)
}
