import 'server-only'
import { cookies } from 'next/headers'
import { defaultLocale, hasLocale, LOCALE_COOKIE, type Locale } from '@/lib/i18n'

// The proxy mirrors the active locale into this cookie so server-side code
// (redirects, route handlers) can resolve the locale without route params.
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies()
  const value = store.get(LOCALE_COOKIE)?.value
  return value && hasLocale(value) ? value : defaultLocale
}