'use client'

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  format,
  localizePath as localize,
  stripLocale,
  dirForLocale,
  LOCALE_COOKIE,
  type AppKey,
  type Dictionary,
  type Locale,
} from '@/lib/i18n'

type Translate = (key: AppKey, values?: Record<string, string | number>) => string

interface I18nValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  dictionary: Dictionary
  t: Translate
  localizePath: (path: string) => string
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale
  dictionary: Dictionary
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname() || '/'
  const dir = dirForLocale(locale)

  const t = useCallback<Translate>(
    (key, values) => {
      const table = dictionary.app as Record<string, string>
      const template = table[key as string]
      return typeof template === 'string' ? format(template, values) : String(key)
    },
    [dictionary],
  )

  const localizePath = useCallback((path: string) => localize(path, locale), [locale])

  const setLocale = useCallback(
    (next: Locale) => {
      const cleanPath = stripLocale(pathname)
      const search = typeof window !== 'undefined' ? window.location.search : ''
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`
      router.push(localize(cleanPath, next) + search)
    },
    [localize, pathname, router],
  )

  const value = useMemo<I18nValue>(
    () => ({ locale, dir, dictionary, t, localizePath, setLocale }),
    [locale, dir, dictionary, t, localizePath, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}

export function useLocale() {
  const { locale, dir, setLocale } = useI18n()
  return { locale, dir, setLocale }
}

export function useTranslate(): Translate {
  return useI18n().t
}

export function useLocaleRouter() {
  const router = useRouter()
  const { locale } = useI18n()
  return useMemo(
    () => ({
      push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(localize(href, locale), options),
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(localize(href, locale), options),
      prefetch: (href: string, options?: Parameters<typeof router.prefetch>[1]) => router.prefetch(localize(href, locale), options),
      back: () => router.back(),
      forward: () => router.forward(),
      refresh: () => router.refresh(),
    }),
    [router, locale],
  )
}

export function useLocalePathname(): string {
  const pathname = usePathname() || '/'
  return stripLocale(pathname)
}