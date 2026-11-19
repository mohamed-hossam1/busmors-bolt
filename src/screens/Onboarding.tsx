'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  FileText,
  Globe,
  Network,
  ShieldCheck,
  Sparkles,
  Users,
  BriefcaseBusiness,
} from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import { supabase } from '../lib/supabase'
import { useCopy } from '../hooks/useCopy'
import { useAuth } from '../context/AuthContext'
import { organizeBrainWithAi, DEFAULT_CRAWL_PAGES, type CrawlProgressEvent } from '../lib/crawl'

type CrawlStep = 'idle' | 'crawling' | 'ai_analysis' | 'linking' | 'done'

export default function Onboarding() {
  const { t } = useCopy()
  const router = useRouter()
  const { session, refreshSettings } = useAuth()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagesRead, setPagesRead] = useState(0)
  const [currentUrl, setCurrentUrl] = useState('')
  const [crawlStep, setCrawlStep] = useState<CrawlStep>('idle')
  const [progressStatus, setProgressStatus] = useState('')
  const [done, setDone] = useState(false)
  const [qualityNotice, setQualityNotice] = useState('')
  const [discoveredCategories, setDiscoveredCategories] = useState<string[]>([])
  const [summaryStats, setSummaryStats] = useState({ pages: 0, nodes: 0, edges: 0 })

  const calculateProgressPercent = () => {
    if (crawlStep === 'done') return 100
    if (crawlStep === 'linking') return 95
    if (crawlStep === 'ai_analysis') return 88
    if (crawlStep === 'crawling') {
      if (pagesRead === 0) return 15
      return Math.min(85, Math.round(15 + (pagesRead / DEFAULT_CRAWL_PAGES) * 70))
    }
    return 0
  }

  const start = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (done) {
      router.push('/brain')
      return
    }

    const raw = url.trim()
    if (!raw) {
      setError('Enter your company website to continue.')
      return
    }

    if (raw.includes('@')) {
      setError('Please enter your website URL (e.g. busmora.com), not an email address.')
      return
    }

    const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`

    try {
      const parsed = new URL(normalized)
      if (!parsed.hostname || !parsed.hostname.includes('.') || parsed.username || parsed.password) {
        setError('Please enter a valid website address (e.g. wesam.ai or company.com)')
        return
      }
    } catch {
      setError('Please enter a valid website address (e.g. wesam.ai or company.com)')
      return
    }

    setBusy(true)
    setError(null)
    setPagesRead(0)
    setCurrentUrl('')
    setDone(false)
    setQualityNotice('')
    setDiscoveredCategories([])
    setCrawlStep('crawling')
    setProgressStatus('Connecting to website and discovering pages...')

    const userId = session?.user.id
    if (!userId) {
      setError('Please sign in to continue.')
      setBusy(false)
      setCrawlStep('idle')
      return
    }

    try {
      await supabase.rpc('set_onboarding_state', { p_state: 'crawling', p_company_url: normalized })

      const result = await organizeBrainWithAi(normalized, userId, (event: CrawlProgressEvent) => {
        if (event.currentUrl) setCurrentUrl(event.currentUrl)
        if (event.categories && event.categories.length > 0) {
          setDiscoveredCategories((prev) => Array.from(new Set([...prev, ...event.categories!])))
        }
        if (event.stage === 'read') {
          const count = event.read ?? 0
          setPagesRead(count)
          setProgressStatus(
            count > 0
              ? `Reading website (${count} useful pages, up to ${event.total ?? DEFAULT_CRAWL_PAGES})...`
              : 'Discovering website structure and pages...'
          )
        } else if (event.stage === 'extract') {
          setCrawlStep('ai_analysis')
          if (event.read) setPagesRead(event.read)
          setProgressStatus(event.message ?? 'Finding business information supported by your website...')
        } else if (event.stage === 'save') {
          setCrawlStep('linking')
          if (event.read) setPagesRead(event.read)
          setProgressStatus(event.message ?? 'Saving your business knowledge...')
        }
      })

      if (!result.success) {
        throw new Error(result.error || 'The website could not be fully read or saved.')
      }

      setSummaryStats({
        pages: result.pagesRead ?? pagesRead ?? 5,
        nodes: result.nodesCount,
        edges: result.edgesCount,
      })
      if (result.categories && result.categories.length > 0) {
        setDiscoveredCategories((prev) => Array.from(new Set([...prev, ...result.categories!])))
      }
      if (result.warning) {
        setQualityNotice(result.warning)
      }

      await supabase.rpc('set_onboarding_state', { p_state: 'complete' })

      await refreshSettings()
      setCrawlStep('done')
      setDone(true)
    } catch (err) {
      await supabase.rpc('set_onboarding_state', { p_state: 'awaiting_url', p_crawl_status: { finished: false } })
        .eq('workspace_id', userId)
      setError(err instanceof Error ? err.message : 'The website could not be fully read or saved. Your current fields are kept; continue manually or retry.')
      setCrawlStep('idle')
    } finally {
      setBusy(false)
    }
  }

  const progressPercent = calculateProgressPercent()
  const hasKnowledge = summaryStats.nodes > 0
  const title = busy
    ? 'Getting to know your business.'
    : done
      ? hasKnowledge ? 'Your Business Brain is ready.' : 'Your workspace is ready.'
      : 'Let’s get to know your business.'
  const subtitle = busy
    ? 'We’re turning your website into a starting point for your Marketing Director.'
    : done
      ? hasKnowledge
        ? 'Website knowledge and review suggestions are saved. Review them in your Business Brain.'
        : 'We couldn’t find enough information on this website. You can add your business knowledge directly in your workspace.'
      : 'Add your website so your Marketing Director starts with context about your company.'
  const activeStep = crawlStep === 'crawling' ? 0 : crawlStep === 'ai_analysis' ? 1 : 2

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      eyebrow={
        <div className="flex items-center gap-2 text-xs font-medium text-primary-700">
          <CheckCircle2 size={16} />
          <span>{done ? 'Ready to explore' : 'Workspace created'}<span className="mx-2 text-ink-300">/</span>Your business</span>
        </div>
      }
      panel={<BusinessContextPanel />}
    >
      {done && qualityNotice && (
        <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          {qualityNotice}
        </p>
      )}
      {!busy && !done ? (
        <form onSubmit={start} noValidate className="space-y-6">
          <div>
            <label htmlFor="company-website" className="mb-1.5 block text-sm font-medium text-ink-700">{t('websiteUrl')}</label>
            <div className="relative">
              <Globe size={18} aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                id="company-website"
                type="text"
                inputMode="url"
                autoComplete="url"
                required
                value={url}
                onChange={(e) => { setUrl(e.target.value); if (error) setError(null) }}
                placeholder="company.com"
                className="input-field ps-10"
                dir="ltr"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'website-hint website-error' : 'website-hint'}
              />
            </div>
            <p id="website-hint" className="mt-2 text-xs leading-5 text-ink-500">Use your main website. We’ll read up to {DEFAULT_CRAWL_PAGES} relevant public pages.</p>
          </div>

          {error && <p id="website-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>}

          <div className="flex items-start gap-3 rounded-2xl border border-primary-200/60 bg-primary-50/60 p-4">
            <Brain size={19} className="mt-0.5 shrink-0 text-primary-600" aria-hidden="true" />
            <p className="text-xs leading-6 text-ink-600">Business knowledge is saved automatically. You can review, edit and add to it anytime.</p>
          </div>

          <div>
            <button type="submit" className="btn-primary w-full">Build my Business Brain<ArrowRight size={16} /></button>
            <button type="button" onClick={() => router.push('/brain')} className="mx-auto mt-3 flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-ink-600 transition hover:text-primary-600">{t('skipForNow')}</button>
          </div>
        </form>
      ) : busy ? (
        <div className="space-y-5" aria-busy="true">
          <div className="rounded-2xl border border-ink-200 bg-white p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3 text-sm">
              <span role="status" aria-live="polite" className="font-medium text-ink-900">{progressStatus}</span>
              <span className="shrink-0 tabular-nums text-primary-600">{progressPercent}%</span>
            </div>
            <div role="progressbar" aria-label="Building your Business Brain" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-primary-100">
              <div className="h-full rounded-full bg-primary-500 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
            </div>
            <ol className="mt-6 space-y-5">
              {[
                { label: 'Read your website', detail: `${pagesRead} of up to ${DEFAULT_CRAWL_PAGES} pages`, icon: Globe },
                { label: 'Organize business knowledge', detail: 'Company, offerings and audience', icon: Brain },
                { label: 'Connect the details', detail: 'Save your business context', icon: Network },
              ].map(({ label, detail, icon: Icon }, index) => (
                <li key={label} className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${index <= activeStep ? 'bg-primary-50 text-primary-600' : 'bg-ink-50 text-ink-400'}`}>
                    {index < activeStep ? <Check size={16} /> : <Icon size={16} className={index === activeStep ? 'motion-safe:animate-pulse' : ''} />}
                  </span>
                  <div><p className={`text-sm font-medium ${index <= activeStep ? 'text-ink-900' : 'text-ink-500'}`}>{label}</p><p className="mt-1 text-xs text-ink-500">{detail}</p></div>
                  {index === activeStep && <span className="ms-auto h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500 motion-safe:animate-pulse" aria-label="In progress" />}
                </li>
              ))}
            </ol>
            {currentUrl && <p className="mt-5 truncate border-t border-ink-100 pt-4 text-xs text-ink-500" dir="ltr" title={currentUrl}>{currentUrl}</p>}
          </div>
          {discoveredCategories.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Discovered knowledge categories">
              {discoveredCategories.map((cat) => (
                <span key={cat} className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700 capitalize">
                  {cat.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
          <p className="text-center text-xs leading-5 text-ink-500">Keep this page open while we gather your business context.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: 'Pages read', value: summaryStats.pages, icon: FileText },
              { label: 'Knowledge items', value: summaryStats.nodes, icon: Brain },
              { label: 'Connections', value: summaryStats.edges, icon: Network },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-ink-200 bg-white px-2 py-5 text-center">
                <Icon size={18} className="mx-auto text-primary-500" />
                <p className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-500 sm:text-xs">{label}</p>
              </div>
            ))}
          </div>
          {hasKnowledge && (
            <p className="flex items-start gap-2 text-xs leading-6 text-ink-600">
              <CheckCircle2 size={16} className="mt-1 shrink-0 text-primary-600" />
              Review suggestions in your Business Brain. Approved knowledge is available to your Marketing Director.
            </p>
          )}
          <div className="space-y-3">
            <button type="button" onClick={() => router.push('/brain')} className="btn-primary w-full">
              {hasKnowledge ? 'Explore my Business Brain' : 'Add business knowledge'}
              <ArrowRight size={16} />
            </button>
            <button type="button" onClick={() => router.push('/employee')} className="btn-secondary w-full">
              Talk to my Director
              <Sparkles size={16} />
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}

function BusinessContextPanel() {
  return (
    <>
      <div className="relative z-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-cosmic-raised px-4 py-2 text-xs text-stage-muted">
          <Brain size={14} className="text-primary-300" />
          Your Business Brain
        </span>
        <h2 className="mt-8 text-[clamp(2.25rem,3vw,3.5rem)] font-normal leading-[1.08] tracking-[-.05em]">
          Good direction.<br />Starts with context.
        </h2>
        <p className="mt-5 max-w-sm text-sm leading-7 text-stage-muted">
          One place for what makes your business yours. A stronger starting point for every conversation.
        </p>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.035] px-4 py-5 xl:px-6">
          <div className="mx-auto flex w-fit items-center gap-2.5 rounded-xl border border-primary-300/30 bg-primary-500/15 px-4 py-3 text-sm font-medium text-white">
            <Brain size={18} className="text-primary-300" />
            Business Brain
          </div>
          <div className="mx-auto h-5 w-px bg-primary-300/30" aria-hidden="true" />
          <div className="mx-auto h-4 w-[68%] rounded-t-lg border-x border-t border-primary-300/30" aria-hidden="true" />
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: 'Company', icon: BriefcaseBusiness },
              { label: 'Audience', icon: Users },
              { label: 'Offerings', icon: Sparkles },
            ].map(({ label, icon: Icon }) => (
              <div key={label} className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-white/10 bg-cosmic-raised/70 px-2 py-3 text-[11px] text-stage-muted xl:text-xs">
                <Icon size={17} className="text-primary-300" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative z-10 flex items-center gap-2 border-t border-white/10 pt-5 text-xs leading-5 text-stage-muted">
        <ShieldCheck size={16} className="shrink-0 text-primary-300" />
        Your business. A foundation you can build on.
      </div>
    </>
  )
}
