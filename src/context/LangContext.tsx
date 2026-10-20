import { createContext, useContext, type ReactNode } from 'react'
import { t as translate, type TranslationKey } from '../lib/i18n'

interface LangContextValue {
  t: (key: TranslationKey) => string
}

const LangContext = createContext<LangContextValue | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const value: LangContextValue = {
    t: (key) => translate(key),
  }

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
