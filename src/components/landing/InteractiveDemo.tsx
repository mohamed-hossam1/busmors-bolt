import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clipboard,
  Copy,
  FileText,
  BriefcaseBusiness,
  LoaderCircle,
  MessageSquareText,
  PenLine,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import {
  createDemoPosts,
  demoBusinesses,
  type ApprovalState,
  type DemoBusiness,
  type DemoTask,
  type DemoTone,
} from '../../data/landingDemoData'
import { loadDemoState, saveDemoState } from '../../lib/demoStorage'

const tones: DemoTone[] = ['Warm', 'Bold', 'Expert']

export default function InteractiveDemo() {
  const saved = useMemo(() => loadDemoState(), [])
  const initialBusiness = saved?.business ?? demoBusinesses[0]
  const [business, setBusiness] = useState<DemoBusiness>(initialBusiness)
  const [task, setTask] = useState<DemoTask>(saved?.task ?? 'posts')
  const [view, setView] = useState<'posts' | 'calendar'>('posts')
  const [posts, setPosts] = useState(saved?.posts ?? createDemoPosts(initialBusiness))
  const [approvals, setApprovals] = useState<Record<string, ApprovalState>>(saved?.approvals ?? {})
  const [stage, setStage] = useState(3)
  const [running, setRunning] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const timerRef = useRef<number[]>([])

  useEffect(() => {
    saveDemoState({ business, task, posts, approvals })
  }, [approvals, business, posts, task])

  useEffect(() => () => timerRef.current.forEach(window.clearTimeout), [])

  const selectBusiness = (next: DemoBusiness) => {
    setBusiness(next)
    setPosts(createDemoPosts(next))
    setApprovals({})
    setStage(3)
  }

  const updateBusiness = <K extends keyof DemoBusiness>(key: K, value: DemoBusiness[K]) => {
    const next = { ...business, [key]: value }
    setBusiness(next)
    if (key === 'tone') setPosts(createDemoPosts(next))
  }

  const runDemo = () => {
    timerRef.current.forEach(window.clearTimeout)
    setRunning(true)
    setStage(0)
    setView(task === 'week' ? 'calendar' : 'posts')
    setPosts(createDemoPosts(business))
    setApprovals({})
    timerRef.current = [
      window.setTimeout(() => setStage(1), 180),
      window.setTimeout(() => setStage(2), 520),
      window.setTimeout(() => {
        setStage(3)
        setRunning(false)
      }, 900),
    ]
  }

  const editCaption = (id: string, caption: string) => {
    setPosts((current) => current.map((post) => (post.id === id ? { ...post, caption } : post)))
  }

  const copyCaption = async (id: string, caption: string) => {
    try {
      await navigator.clipboard.writeText(caption)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(null), 1600)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <section id="demo" className="scroll-mt-20 px-4 py-20 sm:px-5 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="section-kicker"><Sparkles size={14} /> Interactive sample</div>
          <h2 className="mt-5 [text-wrap:balance] text-4xl font-bold tracking-[-0.045em] text-ink-900 sm:text-5xl">Give your Marketing Director a task.</h2>
          <p className="mt-5 text-lg leading-8 text-ink-600">Choose an example business, shape its context, and review the work. This sample uses deterministic example content—not live AI generation.</p>
        </div>

        <div className="mt-12 overflow-hidden rounded-[2rem] border border-ink-200 bg-white shadow-[0_24px_80px_rgba(23,25,38,.12)]">
          <div className="flex flex-col justify-between gap-3 border-b border-ink-100 bg-ink-900 px-5 py-4 text-white sm:flex-row sm:items-center sm:px-7">
            <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-500 text-white"><Sparkles size={18} /></span><div><p className="text-sm font-bold">Guest workspace</p><p className="text-xs text-ink-400">Example content stays in this browser</p></div></div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-primary-300"><span className="h-2 w-2 rounded-full bg-primary-400" /> No account needed</span>
          </div>

          <div className="grid lg:grid-cols-[360px_1fr]">
            <aside className="border-b border-ink-100 bg-lavender-alt p-5 sm:p-7 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Brain size={18} className="text-primary-700" /><h3 className="font-bold text-ink-900">Business Brain</h3></div><span className="rounded-full bg-primary-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-800">Approved</span></div>
              <p className="mt-2 text-sm leading-6 text-ink-500">The company knowledge you review so every task starts with useful context.</p>

              <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="Sample business">
                {demoBusinesses.map((sample) => <button key={sample.id} type="button" onClick={() => selectBusiness(sample)} aria-pressed={business.id === sample.id} className={`rounded-xl border px-2 py-3 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${business.id === sample.id ? 'border-primary-500 bg-white text-ink-900 shadow-sm' : 'border-ink-200 bg-transparent text-ink-500 hover:bg-white'}`}><span className="mx-auto mb-2 block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sample.accent }} />{sample.shortName}</button>)}
              </div>

              <div className="mt-6 space-y-4">
                <label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs font-bold text-ink-700"><FileText size={13} /> Business name</span><input className="input-field" value={business.name} onChange={(event) => updateBusiness('name', event.target.value)} /></label>
                <label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs font-bold text-ink-700"><Users size={13} /> Target audience</span><textarea className="input-field min-h-20 resize-y" value={business.audience} onChange={(event) => updateBusiness('audience', event.target.value)} /></label>
                <fieldset><legend className="mb-1.5 flex items-center gap-2 text-xs font-bold text-ink-700"><MessageSquareText size={13} /> Brand tone</legend><div className="grid grid-cols-3 gap-2">{tones.map((tone) => <button key={tone} type="button" onClick={() => updateBusiness('tone', tone)} aria-pressed={business.tone === tone} className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${business.tone === tone ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-ink-400'}`}>{tone}</button>)}</div></fieldset>
                <label className="block"><span className="mb-1.5 flex items-center gap-2 text-xs font-bold text-ink-700"><Target size={13} /> Campaign goal</span><textarea className="input-field min-h-20 resize-y" value={business.goal} onChange={(event) => updateBusiness('goal', event.target.value)} /></label>
              </div>
            </aside>

            <div className="min-w-0 p-5 sm:p-7 lg:p-8">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-400">Choose a task</p><div className="mt-3 flex flex-col gap-2 sm:flex-row">{([{ id: 'posts', label: 'Write three social posts', icon: PenLine }, { id: 'week', label: 'Plan a week of content', icon: CalendarDays }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTask(id)} aria-pressed={task === id} className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${task === id ? 'border-primary-500 bg-primary-50 text-primary-900' : 'border-ink-200 text-ink-600 hover:border-ink-400'}`}><Icon size={17} />{label}</button>)}</div></div>
                <button type="button" onClick={runDemo} disabled={running} className="btn-primary shrink-0 !rounded-xl !px-5 !py-3">{running ? <LoaderCircle size={17} className="animate-spin" /> : <Sparkles size={17} />}{running ? 'Working…' : 'Run sample task'}<ChevronRight size={16} /></button>
              </div>

              <div className="relative my-7 grid grid-cols-3 gap-2 rounded-2xl border border-ink-100 bg-ink-50 p-4" aria-live="polite">
                <span className={`demo-flow-line ${running ? 'is-running' : ''}`} aria-hidden="true" />
                {[
                  { label: 'Context loaded', sub: 'Business Brain', icon: Brain },
                  { label: 'Plan shaped', sub: task === 'week' ? '5 content angles' : '3 post angles', icon: Clipboard },
                  { label: 'Drafts ready', sub: 'For your review', icon: CheckCircle2 },
                ].map(({ label, sub, icon: Icon }, index) => <div key={label} className="relative z-10 text-center"><span className={`mx-auto grid h-10 w-10 place-items-center rounded-xl border transition-all duration-300 ${stage > index ? 'border-primary-400 bg-primary-500 text-white shadow-[0_0_0_5px_rgba(28,220,171,.13)]' : 'border-ink-200 bg-white text-ink-400'}`}>{stage > index ? <Check size={17} /> : <Icon size={17} />}</span><p className="mt-2 text-[11px] font-bold text-ink-800 sm:text-xs">{label}</p><p className="mt-0.5 hidden text-[10px] text-ink-500 sm:block">{sub}</p></div>)}
              </div>

              <div className={`transition-opacity duration-300 ${stage < 3 ? 'opacity-45' : 'opacity-100'}`} aria-busy={running}>
                <div className="mb-5 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-ink-900">Ready for your review</p><p className="mt-0.5 text-xs text-ink-500">Edit the copy and approve what you want to use.</p></div><div className="flex rounded-lg bg-ink-100 p-1"><button type="button" onClick={() => setView('posts')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === 'posts' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>Posts</button><button type="button" onClick={() => setView('calendar')} className={`rounded-md px-3 py-1.5 text-xs font-bold ${view === 'calendar' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'}`}>Week</button></div></div>

                {view === 'posts' ? (
                  <div className="grid gap-4 xl:grid-cols-3">
                    {posts.slice(0, 3).map((post, index) => <article key={post.id} className="result-card flex min-h-[300px] flex-col rounded-2xl border border-ink-200 bg-white p-4 shadow-sm" style={{ animationDelay: `${index * 90}ms` }}><div className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-bold text-ink-600">{post.channel === 'LinkedIn' ? <BriefcaseBusiness size={14} /> : <Camera size={14} />}{post.channel}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${approvals[post.id] === 'Approved' ? 'bg-primary-100 text-primary-800' : 'bg-amber-50 text-amber-700'}`}>{approvals[post.id] ?? 'Draft'}</span></div><p className="mt-4 text-xs font-bold uppercase tracking-wider text-primary-700">{post.theme}</p><textarea aria-label={`Edit ${post.theme} caption`} value={post.caption} onChange={(event) => editCaption(post.id, event.target.value)} className="mt-2 flex-1 resize-none rounded-xl border border-transparent bg-ink-50 p-3 text-sm leading-6 text-ink-700 outline-none transition focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20" /><div className="mt-3 flex gap-2"><button type="button" onClick={() => void copyCaption(post.id, post.caption)} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-200 px-2 py-2 text-xs font-bold text-ink-600 hover:bg-ink-50">{copiedId === post.id ? <Check size={14} /> : <Copy size={14} />}{copiedId === post.id ? 'Copied' : 'Copy'}</button><button type="button" onClick={() => setApprovals((current) => ({ ...current, [post.id]: current[post.id] === 'Approved' ? 'Draft' : 'Approved' }))} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition ${approvals[post.id] === 'Approved' ? 'bg-primary-500 text-white' : 'bg-ink-900 text-white hover:bg-ink-800'}`}><CheckCircle2 size={14} />{approvals[post.id] === 'Approved' ? 'Approved' : 'Approve'}</button></div></article>)}
                  </div>
                ) : (
                  <div className="overflow-x-auto pb-2"><div className="grid min-w-[680px] grid-cols-5 gap-3">{posts.map((post, index) => <article key={post.id} className="result-card rounded-2xl border border-ink-200 bg-white p-3 shadow-sm" style={{ animationDelay: `${index * 70}ms` }}><p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">{post.day}</p><p className="mt-1 text-xs text-ink-500">{post.time}</p><div className="mt-4 rounded-xl bg-primary-50 p-3"><p className="text-xs font-bold text-primary-900">{post.theme}</p><p className="mt-2 line-clamp-4 text-[11px] leading-5 text-ink-600">{post.caption}</p></div><p className="mt-3 text-[10px] font-semibold text-ink-400">{post.channel}</p></article>)}</div></div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-5 border-t border-ink-100 bg-primary-50/70 px-6 py-6 sm:flex-row sm:items-center sm:px-8">
            <div><p className="font-bold text-ink-900">Ready to use your own business?</p><p className="mt-1 text-sm text-ink-600">Your sample inputs and edits will stay saved on this device as you sign up.</p></div>
            <Link to="/signup" className="btn-primary shrink-0 !rounded-xl">Create my workspace <ArrowRight size={16} /></Link>
          </div>
        </div>
      </div>
    </section>
  )
}
