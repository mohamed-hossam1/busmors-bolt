'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowUpRight, Brain, ShieldCheck } from 'lucide-react'
import Brand from '../Brand'
import LanguageSwitcher from '../LanguageSwitcher'
import { useCopy } from '../../hooks/useCopy'

export default function AuthLayout({
  children,
  title,
  subtitle,
  eyebrow,
  panel,
  alignTop = false,
}: {
  children: ReactNode
  title: string
  subtitle: string
  eyebrow?: ReactNode
  panel?: ReactNode
  alignTop?: boolean
}) {
  const isTop = alignTop
  const { t } = useCopy()

  return (
    <div className="grid min-h-[100dvh] bg-ink-50 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col px-6 py-6 sm:px-10 lg:px-14">
        <header className="mx-auto flex w-full max-w-md items-center justify-between gap-4 pb-2">
          <Brand />
          <LanguageSwitcher />
        </header>
        <div className={`mx-auto flex w-full max-w-md flex-1 flex-col ${isTop ? 'justify-start pt-6 sm:pt-8' : 'justify-center py-6 sm:py-10'}`}>
          {eyebrow && <div className="mb-4">{eyebrow}</div>}
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">{subtitle}</p>
          <div className="mt-6 sm:mt-8">{children}</div>
        </div>
        <footer className="mx-auto mt-auto w-full max-w-md pt-4">
          <p className="text-xs text-ink-500">{t('authFooterTagline')}</p>
        </footer>
      </div>
      <aside className={`auth-brand-panel relative mx-6 my-6 hidden w-full min-w-0 max-w-2xl flex-col gap-10 ${isTop ? 'self-start lg:sticky lg:top-8' : 'self-center'} justify-self-center overflow-hidden rounded-[32px] border border-white/10 bg-cosmic-card p-8 text-white lg:flex lg:w-[calc(100%_-_3rem)] xl:p-12`}>
        {panel ?? <>
        <div className="relative z-10"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-cosmic-raised px-4 py-2 text-xs text-stage-muted"><Brain size={14} className="text-primary-300" />{t('yourAiMarketingDirector')}</span>
          <h2 className="mt-8 text-[clamp(2.25rem,3.5vw,3.75rem)] font-normal leading-[1.08] tracking-[-.05em]">{t('marketingDirection')}<br />{t('builtAroundYou')}</h2>
          <p className="mt-4 max-w-sm text-sm leading-7 text-stage-muted">{t('oneSharedUnderstanding')}</p>
        </div>
        <div className="relative z-10 flex items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-stage-muted"><span className="flex items-center gap-2"><ShieldCheck size={16} />{t('yourContextYourDecisions')}</span><ArrowUpRight size={20} className="text-primary-300 rtl:-scale-x-100" /></div>
        </>}
      </aside>
    </div>
  )
}

export function AuthField(props: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  const isLtrField = props.type === 'email' || props.type === 'password'
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">
        <span className="text-red-500">*</span> {props.label}
      </span>
      <input
        type={props.type}
        dir={isLtrField ? 'ltr' : undefined}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={`input-field ${isLtrField ? 'text-left placeholder:text-start' : ''}`}
        autoComplete={props.autoComplete ?? (props.type === 'email' ? 'email' : props.type === 'password' ? 'current-password' : 'organization')}
        required
      />
    </label>
  )
}

export function useAuthError() {
  const { t } = useCopy()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<string | null>) => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const err = await fn()
      if (err) setError(err)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorGeneric'))
    } finally {
      setBusy(false)
    }
  }

  const wrap = (e: FormEvent, fn: () => Promise<void>) => {
    e.preventDefault()
    void fn()
  }

  return { error, setError, notice, setNotice, busy, run, wrap }
}
