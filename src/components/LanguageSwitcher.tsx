'use client'

import { useI18n } from '@/context/I18nContext'
import type { Locale } from '@/lib/i18n'

const OPTIONS: { value: Locale; label: string }[] = [
  { value: 'ar', label: 'عربي' },
  { value: 'en', label: 'EN' },
]

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n()
  return (
    <div
      role="group"
      aria-label={t('switchLanguage')}
      dir="ltr"
      className={`inline-flex items-center rounded-full border border-ink-200 bg-white p-0.5 shadow-2xs ${className}`}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLocale(option.value)}
          aria-pressed={locale === option.value}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            locale === option.value ? 'bg-primary-500 text-white shadow-2xs' : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}