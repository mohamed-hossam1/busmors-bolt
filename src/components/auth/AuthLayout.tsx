import { useState, type FormEvent, type ReactNode } from 'react'
import { Sparkles, Brain, Calendar, Send, CheckCircle2 } from 'lucide-react'

export default function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <div className="flex min-h-screen min-h-[100dvh] bg-white">
      {/* Left: form */}
      <div className="flex w-full flex-col p-5 sm:p-8 md:w-1/2 md:p-12 lg:p-14">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500 shadow-sm">
            <div className="h-3.5 w-3.5 rotate-45 rounded-sm bg-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-ink-900">busmora</span>
        </div>

        <div className="flex flex-1 items-center py-6 sm:py-8">
          <div className="w-full max-w-md animate-fade-up">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">{title}</h1>
            <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
            <div className="mt-6 sm:mt-8">{children}</div>
          </div>
        </div>
      </div>

      {/* Right: product mockup matching BusMora (AI Marketing Employee & Business Brain) */}
      <div className="relative hidden w-1/2 flex-col justify-center overflow-hidden bg-ink-100 p-12 lg:flex">
        <div className="relative mx-auto w-full max-w-lg">
          {/* Browser window card */}
          <div className="rounded-2xl bg-white shadow-lift ring-1 ring-ink-200/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 bg-white">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              </div>
              <span className="text-[11px] font-medium text-ink-400" dir="ltr">busmora.ai/employee</span>
            </div>
            <div className="p-5">
              <div className="mb-4 inline-flex items-center gap-2 rounded-lg bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-800 border border-primary-200">
                <Sparkles size={13} className="text-primary-600" />
                Planned Content & Campaigns
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3.5 border border-ink-100">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-primary-700">
                    <Calendar size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-ink-900 truncate">Q4 Growth Campaign Strategy</p>
                      <span className="badge bg-emerald-50 text-emerald-700 text-[10px]">Ready</span>
                    </div>
                    <p className="text-[11px] text-ink-500 truncate mt-0.5">6 posts generated for Instagram & Facebook</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3.5 border border-ink-100">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-700">
                    <Brain size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-ink-900 truncate">Competitor Market Analysis</p>
                      <span className="badge bg-primary-50 text-primary-700 text-[10px]">Synced</span>
                    </div>
                    <p className="text-[11px] text-ink-500 truncate mt-0.5">Identified 4 positioning differentiators</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-ink-50 p-3.5 border border-ink-100">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700">
                    <CheckCircle2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-ink-900 truncate">Audience & Tone Alignment</p>
                      <span className="badge bg-ink-100 text-ink-700 text-[10px]">Approved</span>
                    </div>
                    <p className="text-[11px] text-ink-500 truncate mt-0.5">14 knowledge nodes mapped in Brain</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating stat card 1 - AI Marketing Employee */}
          <div
            className="absolute -right-6 -top-8 w-64 animate-fade-up rounded-2xl bg-white p-4 shadow-lift border border-ink-100"
            style={{ animationDelay: '80ms' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-primary-400">
                <Brain size={20} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink-900">AI Marketing Employee</p>
                <p className="text-xs text-ink-500 truncate">Always-on research & content</p>
              </div>
            </div>
          </div>

          {/* Floating stat card 2 - Business Brain */}
          <div
            className="absolute -bottom-8 -left-8 w-72 animate-fade-up rounded-2xl bg-white p-4 shadow-lift border border-ink-100"
            style={{ animationDelay: '160ms' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <Sparkles size={18} />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-ink-900">Business Brain</p>
                  <span className="badge bg-emerald-50 text-emerald-700 text-[10px]">• Active</span>
                </div>
                <p className="text-xs text-ink-500 truncate">Learns from your website & goals</p>
              </div>
            </div>
          </div>

          {/* Floating CTA button */}
          <div
            className="absolute -right-4 bottom-14 w-52 animate-fade-up rounded-2xl bg-primary-500 px-4 py-3 text-center shadow-lift border border-primary-400"
            style={{ animationDelay: '240ms' }}
          >
            <div className="flex items-center justify-center gap-2 text-ink-900 font-bold text-sm">
              <Send size={15} />
              <span>Launch Campaign</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AuthField(props: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-ink-700">
        <span className="text-red-500">*</span> {props.label}
      </span>
      <input
        type={props.type}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="input-field"
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
    const err = await fn()
    setBusy(false)
    if (err) setError(err)
  }

  const wrap = (e: FormEvent, fn: () => Promise<void>) => {
    e.preventDefault()
    void fn()
  }

  return { error, setError, notice, setNotice, busy, run, wrap }
}
