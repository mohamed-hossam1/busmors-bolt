import { ArrowDown, ArrowRight, Brain, Check, PenLine, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden px-5 pb-14 pt-16 sm:pt-24 lg:px-8 lg:pb-20">
      <div className="landing-orb landing-orb-one" aria-hidden="true" />
      <div className="landing-orb landing-orb-two" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.04fr_.96fr]">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-500/25 bg-primary-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary-800">
            <Sparkles size={14} /> Your marketing workflow, in one place
          </div>
          <h1 className="text-balance text-5xl font-bold leading-[1.02] tracking-[-0.055em] text-ink-900 sm:text-6xl lg:text-[4.65rem]">
            Turn your business knowledge into your next <span className="relative whitespace-nowrap text-primary-600">marketing move.<span className="absolute -bottom-1 left-0 h-2 w-full rounded-full bg-primary-200/70 -z-10" /></span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink-600 sm:text-xl">
            Meet your AI marketing employee. Bring your brand context into research, social posts, and content plans—all in one workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#demo" className="btn-primary group !px-6 !py-3.5 !text-base">Try the interactive demo <ArrowDown size={17} className="transition-transform group-hover:translate-y-0.5" /></a>
            <Link to="/signup" className="btn-secondary group !px-6 !py-3.5 !text-base">Create account <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" /></Link>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-500"><Check size={15} className="text-primary-600" /> No account or API key needed for the demo.</p>
        </div>

        <div className="relative mx-auto w-full max-w-xl" aria-label="BusMora product preview">
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-primary-200/50 via-white to-accent-100 blur-2xl" />
          <div className="relative overflow-hidden rounded-[1.75rem] border border-ink-200/80 bg-white shadow-[0_28px_80px_rgba(11,43,34,.14)]">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#ff8f7c]" /><span className="h-2.5 w-2.5 rounded-full bg-[#ffd76e]" /><span className="h-2.5 w-2.5 rounded-full bg-primary-400" /></div>
              <span className="rounded-full bg-ink-50 px-3 py-1 text-[11px] font-semibold text-ink-500">Marketing workspace</span>
            </div>
            <div className="grid min-h-[420px] grid-cols-[72px_1fr] sm:grid-cols-[170px_1fr]">
              <aside className="border-r border-ink-100 bg-ink-900 p-3 text-white sm:p-4">
                <div className="mb-7 flex items-center gap-2 text-xs font-bold"><span className="h-6 w-6 rounded-lg bg-primary-500" /><span className="hidden sm:block">busmora</span></div>
                {['Employee', 'Business Brain', 'Calendar'].map((item, index) => <div key={item} className={`mb-2 rounded-lg px-2 py-2 text-[10px] sm:text-xs ${index === 0 ? 'bg-white/10 text-primary-300' : 'text-ink-400'}`}>{item}</div>)}
              </aside>
              <div className="bg-[#f8faf8] p-4 sm:p-6">
                <div className="flex items-center justify-between"><div><p className="text-xs font-semibold text-primary-700">TASK IN PROGRESS</p><p className="mt-1 text-sm font-bold text-ink-900 sm:text-base">Plan launch week content</p></div><span className="rounded-full bg-primary-100 px-2.5 py-1 text-[10px] font-bold text-primary-800">3/3 ready</span></div>
                <div className="mt-6 grid grid-cols-3 items-center gap-2">
                  {[['Business Brain', Brain], ['Planning', Sparkles], ['Posts', PenLine]].map(([label, Icon], index) => {
                    const IconComponent = Icon as typeof Brain
                    return <div key={label as string} className="relative"><div className="relative z-10 mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-primary-700 shadow-card"><IconComponent size={17} /></div><p className="mt-2 truncate text-center text-[9px] font-semibold text-ink-500 sm:text-[11px]">{label as string}</p>{index < 2 && <span className="absolute left-[65%] top-5 h-px w-[70%] bg-primary-300" />}</div>
                  })}
                </div>
                <div className="mt-6 space-y-3">
                  {['A clearer launch story', 'Customer problem spotlight', 'Friday demo invitation'].map((title, index) => <div key={title} className="landing-preview-card flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-3 shadow-sm" style={{ animationDelay: `${index * 130}ms` }}><span className="mt-1 h-7 w-7 shrink-0 rounded-lg bg-primary-100" /><div><p className="text-xs font-bold text-ink-800">{title}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-ink-500">Draft grounded in your audience, voice, and campaign goal.</p></div></div>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
