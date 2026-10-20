import { Brain, CheckCircle2, MessageSquareText, Search, Sparkles } from 'lucide-react'

const steps = [
  { number: '01', title: 'Build your Business Brain', copy: 'Add your website and company knowledge, then review what BusMora knows: products, audience, voice, positioning, and goals.', icon: Brain },
  { number: '02', title: 'Give it a marketing task', copy: 'Ask for market research, competitor analysis, social content, or a content calendar—with your approved context already attached.', icon: MessageSquareText },
  { number: '03', title: 'Review and use the results', copy: 'Follow the work on the agent canvas, edit the deliverables, approve planned posts, then publish them manually where you need them.', icon: CheckCircle2 },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-ink-900 px-5 py-20 text-white lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-end">
          <div><div className="section-kicker !border-white/10 !bg-white/5 !text-primary-300">How it works</div><h2 className="mt-5 text-balance text-4xl font-bold tracking-[-0.045em] sm:text-5xl">Context in. Useful work out.</h2><p className="mt-5 max-w-md text-lg leading-8 text-ink-300">BusMora connects what you know about your business to the work your marketing employee creates.</p></div>
          <div className="relative grid gap-4 md:grid-cols-3">
            <span className="absolute left-[15%] right-[15%] top-10 hidden h-px bg-gradient-to-r from-primary-400/20 via-primary-400 to-primary-400/20 md:block" />
            {steps.map(({ number, title, copy, icon: Icon }) => <article key={number} className="relative rounded-2xl border border-white/10 bg-white/[.055] p-6 backdrop-blur"><div className="relative z-10 grid h-12 w-12 place-items-center rounded-2xl border border-primary-400/30 bg-ink-900 text-primary-400"><Icon size={21} /></div><p className="mt-6 text-xs font-bold tracking-[.16em] text-primary-400">STEP {number}</p><h3 className="mt-2 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-ink-300">{copy}</p></article>)}
          </div>
        </div>
        <div className="mt-12 grid gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:p-6">
          <div className="rounded-xl bg-white/5 p-4"><p className="text-xs font-bold text-primary-300">APPROVED KNOWLEDGE</p><p className="mt-2 text-sm">Audience · Brand voice · Goals</p></div><Sparkles className="mx-auto hidden text-primary-400 sm:block" size={18} /><div className="rounded-xl bg-white/5 p-4"><p className="text-xs font-bold text-primary-300">VISIBLE PROGRESS</p><div className="mt-2 flex items-center gap-2 text-sm"><Search size={14} /> Research <span className="text-ink-500">→</span> Draft</div></div><Sparkles className="mx-auto hidden text-primary-400 sm:block" size={18} /><div className="rounded-xl bg-primary-500 p-4 text-ink-900"><p className="text-xs font-bold">REVIEWABLE OUTPUT</p><p className="mt-2 text-sm font-semibold">Posts · Plans · Research</p></div>
        </div>
      </div>
    </section>
  )
}
