import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowUpRight, Brain, ShieldCheck } from 'lucide-react'
import Brand from '../Brand'

export default function AuthLayout({ children, title, subtitle, eyebrow, panel }: { children: ReactNode; title: string; subtitle: string; eyebrow?: ReactNode; panel?: ReactNode }) {
  return (
    <div className="grid min-h-[100dvh] bg-ink-50 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col px-6 py-7 sm:px-12 lg:px-16">
        <div className="flex items-center justify-between gap-4"><Brand /></div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12 sm:py-16">
          {eyebrow && <div className="mb-6">{eyebrow}</div>}
          <h1 className="text-3xl font-semibold tracking-[-.04em] text-ink-900 sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        <p className="text-xs text-ink-600">{('Busmora · Your business at the center.')}</p>
      </div>
      <aside className="auth-brand-panel relative mx-6 my-12 hidden w-full min-w-0 max-w-2xl flex-col gap-12 self-center justify-self-center overflow-hidden rounded-[32px] border border-white/10 bg-cosmic-card p-10 text-white lg:flex lg:w-[calc(100%_-_3rem)] xl:p-14">
        {panel ?? <>
        <div className="relative z-10"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-cosmic-raised px-4 py-2 text-xs text-stage-muted"><Brain size={14} className="text-primary-300" />{('Your AI Marketing Director')}</span>
          <h2 className="mt-10 text-[clamp(2.5rem,4vw,4rem)] font-normal leading-[1.08] tracking-[-.05em]">{('Marketing direction.')}<br />{('Built around you.')}</h2>
          <p className="mt-5 max-w-sm text-sm leading-7 text-stage-muted">{('One shared understanding of your business. A useful next step. Work you can review and make your own.')}</p>
        </div>
        <div className="relative z-10 flex items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-stage-muted"><span className="flex items-center gap-2"><ShieldCheck size={16} />{('Your context. Your decisions.')}</span><ArrowUpRight size={20} className="text-primary-300" /></div>
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
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-700">
        <span className="text-red-500">*</span> {props.label}
      </span>
      <input
        type={props.type}
        dir={props.type === 'email' ? 'ltr' : undefined}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="input-field"
        autoComplete={props.autoComplete ?? (props.type === 'email' ? 'email' : props.type === 'password' ? 'current-password' : 'organization')}
        required
      />
    </label>
  )
}

export function useAuthError() {
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
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
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
