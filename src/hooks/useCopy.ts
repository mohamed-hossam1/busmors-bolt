import { useI18n } from '../context/I18nContext'

// Product copy lives in the active locale dictionary (src/app/[lang]/dictionaries).
export function useCopy() {
  const { t } = useI18n()
  return { t }
}