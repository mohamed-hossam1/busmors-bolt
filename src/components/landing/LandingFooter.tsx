import { ArrowRight, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function LandingFooter() {
  return (
    <footer className="px-5 pb-6 lg:px-8"><div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-ink-900 px-6 py-12 text-white sm:px-10 lg:px-16 lg:py-16"><div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center"><div className="max-w-2xl"><p className="flex items-center gap-2 text-sm font-bold text-primary-400"><Sparkles size={16} /> Your business already has the context.</p><h2 className="mt-4 text-balance text-3xl font-bold tracking-[-0.04em] sm:text-5xl">Turn it into your next marketing move.</h2></div><div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><a href="#demo" className="btn-secondary !border-white/20 !bg-white/5 !text-white hover:!bg-white/10">Try the demo</a><Link to="/signup" className="btn-primary">Create account <ArrowRight size={16} /></Link></div></div><div className="mt-12 flex flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-ink-400 sm:flex-row"><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-500"><span className="h-2.5 w-2.5 rotate-45 rounded-sm bg-ink-900" /></span><span className="font-bold text-white">busmora</span></div><p>AI marketing work, grounded in the business you know.</p></div></div></footer>
  )
}
