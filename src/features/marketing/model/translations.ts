import messages from './messages.json'

// Reuse the reference copy in the target's English interface without a Next.js runtime.
export function useTranslations(namespace: keyof typeof messages) {
  return (key: string, values?: Record<string, string | number>): string => {
    const value = key.split('.').reduce<unknown>((current, part) =>
      current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined, messages[namespace])
    return typeof value === 'string' ? value.replace(/\{(\w+)(?:,\s*number)?\}/g, (match, name) => String(values?.[name] ?? match)) : key
  }
}
