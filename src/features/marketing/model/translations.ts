'use client'

import { useI18n } from '@/context/I18nContext'

// Marketing copy namespaces (Marketing, Process) live in the active locale
// dictionary, loaded through the I18nProvider. Dot paths resolve inside the namespace.
export function useTranslations(namespace: 'Marketing' | 'Process') {
  const { dictionary } = useI18n()
  return (key: string, values?: Record<string, string | number>): string => {
    const value = key.split('.').reduce<unknown>(
      (current, part) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined),
      dictionary[namespace],
    )
    return typeof value === 'string'
      ? value.replace(/\{(\w+)(?:,\s*number)?\}/g, (match, name) => String(values?.[name] ?? match))
      : key
  }
}