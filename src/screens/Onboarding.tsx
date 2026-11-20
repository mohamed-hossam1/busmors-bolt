'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  CreditCard,
  Globe,
  MessageCircle,
  Network,
  PenLine,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  BriefcaseBusiness,
  FileText,
} from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import { supabase } from '../lib/supabase'
import { useCopy } from '../hooks/useCopy'
import { useAuth } from '../context/AuthContext'
import {
  organizeBrainWithAi,
  readWebsiteKnowledge,
  DEFAULT_CRAWL_PAGES,
  type CrawlProgressEvent,
  type ExtractedCandidate,
} from '../lib/crawl'
import BusinessForm from '../features/onboarding/BusinessForm'
import {
  mergeWebsiteFields,
  validateBusiness,
  type BusinessDraftRow,
  type BusinessFormData,
} from '../features/onboarding/types'

type Phase = 'choose' | 'website' | 'manual' | 'done'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type CrawlStep = 'idle' | 'crawling' | 'ai_analysis' | 'linking' | 'done'
type DraftPath = 'manual' | 'website'

/**
 * C08: project source-backed crawl candidates onto the editable business draft.
 * Only fields the website actually supports are returned, so the merge never
 * blanks a value the owner already typed. Every populated field keeps its
 * source URL + excerpt for provenance.
 */
function mapCandidatesToBusiness(
  candidates: ExtractedCandidate[]
): { form: Partial<BusinessFormData>; fieldSources: Record<string, { url: string; excerpt: string }> } {
  const form: Partial<BusinessFormData> = {}
  const fieldSources: Record<string, { url: string; excerpt: string }> = {}
  const profile = candidates.find((c) => c.category === 'company_profile')
  if (profile) {
    if (profile.title.trim()) {
      form.name = profile.title.trim().slice(0, 150)
      fieldSources.name = { url: profile.source_url, excerpt: profile.summary.slice(0, 500) }
    }
    if (profile.summary.trim()) {
      form.description = profile.summary.trim().slice(0, 3000)
      fieldSources.description = { url: profile.source_url, excerpt: profile.summary.slice(0, 500) }
    }
  }
  const offerings = candidates.filter((c) => c.category === 'offering')
  if (offerings.length) {
    form.offerings = offerings.slice(0, 20).map((c) => ({
      id: crypto.randomUUID(),
      name: c.title.trim().slice(0, 150) || 'Offering',
      description: c.summary.trim(),
      pricingModel: 'unknown',
      amount: null,
      currency: null,
    }))
    fieldSources.offerings = { url: offerings[0].source_url, excerpt: offerings.map((c) => c.title).join(', ').slice(0, 500) }
  }
  const brand = candidates.find((c) => c.category === 'brand_rule')
  if (brand && brand.summary.trim()) {
    form.tone = brand.summary.trim().slice(0, 300)
    fieldSources.tone = { url: brand.source_url, excerpt: brand.summary.slice(0, 500) }
  }
  return { form, fieldSources }
}

export default function Onboarding() {
  const { t } = useCopy()
  const router = useRouter()
  const { session, refreshSettings } = useAuth()

  const [phase, setPhase] = useState<Phase>('choose')
  const [path, setPath] = useState<DraftPath>('manual')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pagesRead, setPagesRead] = useState(0)
  const [totalPages, setTotalPages] = useState(DEFAULT_CRAWL_PAGES)
  const [currentUrl, setCurrentUrl] = useState('')
  const [crawlStep, setCrawlStep] = useState<CrawlStep>('idle')
  const [progressStatus, setProgressStatus] = useState('')
  const [qualityNotice, setQualityNotice] = useState('')
  // Aggregate counts only (never the extracted content) shown on completion.
  const [summary, setSummary] = useState({ pages: 0, items: 0 })

  const [version, setVersion] = useState(0)
  const [form, setForm] = useState<BusinessFormData>(() => ({
    name: '',
    description: '',
    country: '',
    serviceArea: '',
    offerings: [{ id: crypto.randomUUID(), name: '', description: '', pricingModel: 'unknown', amount: null, currency: null }],
    conversionRoute: { state: 'not_ready' },
  }))
  const [fieldSources, setFieldSources] = useState<Record<string, { url: string; excerpt: string }>>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [conflict, setConflict] = useState(false)

  const userId = session?.user.id

  // Load any existing draft so a returning owner continues where they left off.
  useEffect(() => {
    if (!userId) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('business_drafts').select('*').eq('workspace_id', userId).maybeSingle()
      if (!alive || !data) return
      const row = data as unknown as BusinessDraftRow
      setVersion(row.version)
      setForm(row.form)
      setFieldSources(row.field_sources ?? {})
      setPath(row.path ?? 'manual')
    })()
    return () => {
      alive = false
    }
  }, [userId])

  const fetchDraft = async (): Promise<BusinessDraftRow | null> => {
    if (!userId) return null
    const { data } = await supabase.from('business_drafts').select('*').eq('workspace_id', userId).maybeSingle()
    return (data as unknown as BusinessDraftRow) ?? null
  }

  const applyRow = (row: BusinessDraftRow) => {
    setVersion(row.version)
    setForm(row.form)
    setFieldSources(row.field_sources ?? {})
  }

  // C07: persist through the SECURITY DEFINER RPC. It owns the expected-version
  // check, so a stale save raises STALE_VERSION and we reload the newer draft.
  const persistDraft = async (opts: {
    path: DraftPath
    form: BusinessFormData
    fieldSources: Record<string, { url: string; excerpt: string }>
  }): Promise<BusinessDraftRow | null> => {
    setSaveState('saving')
    setError(null)
    if (!userId) {
      setSaveState('error')
      setError('Please sign in again to save.')
      return null
    }
    const { data, error: rpcError } = await supabase.rpc('save_business_draft', {
      p_form: opts.form,
      p_expected_version: version,
      p_path: opts.path,
      p_field_sources: opts.fieldSources,
    })
    if (rpcError) {
      setSaveState('error')
      if (rpcError.message?.includes('STALE_VERSION')) {
        const fresh = await fetchDraft()
        if (fresh) applyRow(fresh)
        setConflict(false)
        setError('This draft was updated in another session and has been reloaded. Please apply your change again.')
      } else {
        setError(rpcError.message || 'Your changes could not be saved. Please try again.')
      }
      return null
    }
    const row = data as unknown as BusinessDraftRow
    applyRow(row)
    setSaveState('saved')
    return row
  }

  const reloadAfterConflict = async () => {
    const fresh = await fetchDraft()
    if (fresh) applyRow(fresh)
    setConflict(false)
    setError(null)
    setSaveState('idle')
  }

  // C07: confirmation writes owner-approved context and completes onboarding.
  const confirmDraft = async () => {
    const problems = validateBusiness(form)
    if (problems.length) {
      setError('Please complete the required fields before confirming.')
      setPhase('manual')
      return
    }
    setConflict(false)
    const saved = await persistDraft({ path, form, fieldSources })
    if (!saved) return
    setSaveState('saving')
    const { error: confirmError } = await supabase.rpc('confirm_business_draft', {
      p_draft_id: saved.id,
      p_expected_version: saved.version,
    })
    if (confirmError) {
      setSaveState('error')
      if (confirmError.message?.includes('STALE_VERSION')) {
        setConflict(true)
        setError('This draft changed while confirming. Reload to continue.')
      } else {
        setError(confirmError.message || 'Confirmation failed. Please try again.')
      }
      return
    }
    await supabase.rpc('set_onboarding_state', { p_state: 'complete' })
    await refreshSettings()
    setSaveState('saved')
    setPhase('done')
  }

  const saveManualDraft = async () => {
    await persistDraft({ path, form, fieldSources })
  }

  const startCrawl = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return

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

    if (!userId) {
      setError('Please sign in to continue.')
      return
    }

    setBusy(true)
    setError(null)
    setPagesRead(0)
    setCurrentUrl('')
    setQualityNotice('')
    setConflict(false)
    setCrawlStep('crawling')
    setProgressStatus('Connecting to website and discovering pages...')

    // C08: snapshot the owner's current draft at request start. When the crawl
    // returns we merge extracted fields through mergeWebsiteFields so edits made
    // while the crawl was in flight are never overwritten by late results.
    const baselineForm = form
    const baselineSources = fieldSources

    try {
      await supabase.rpc('set_onboarding_state', { p_state: 'crawling', p_company_url: normalized })

      // 1) Read pages first to obtain source-backed candidates. This warms the
      // server read cache so the organize call below reuses it (single crawl).
      const knowledge = await readWebsiteKnowledge(normalized, (stage, read, current) => {
        if (current) setCurrentUrl(current)
        if (stage === 'read') {
          setPagesRead(read)
          setCrawlStep('crawling')
          setProgressStatus(read > 0 ? `Reading website (${read} useful pages)...` : 'Discovering website structure and pages...')
        } else if (stage === 'extract') {
          setCrawlStep('ai_analysis')
          setProgressStatus('Finding business information supported by your website...')
        }
      })

      // 2) Map candidates onto the editable draft and save as a website draft.
      const incoming = mapCandidatesToBusiness(knowledge.candidates)
      const mergedForm = mergeWebsiteFields(form, baselineForm, incoming.form)
      const mergedSources = { ...baselineSources, ...incoming.fieldSources }
      const savedRow = await persistDraft({ path: 'website', form: mergedForm, fieldSources: mergedSources })
      if (savedRow) {
        setPath('website')
      }

      // 3) Organize the Business Brain (reuses cache). Candidates stay unreviewed.
      const result = await organizeBrainWithAi(normalized, userId, (event: CrawlProgressEvent) => {
        if (event.currentUrl) setCurrentUrl(event.currentUrl)
        if (event.total) setTotalPages(event.total)
        if (event.stage === 'extract') {
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

      if (result.warning) {
        setQualityNotice(result.warning)
      }
      setSummary({ pages: result.pagesRead ?? pagesRead, items: result.nodesCount })

      // The extracted knowledge is saved internally (Brain records + draft).
      // It is intentionally NOT shown to the client; onboarding completes and the
      // owner chooses what to do next.
      await supabase.rpc('set_onboarding_state', { p_state: 'complete' })
      await refreshSettings()
      setCrawlStep('done')
      setPhase('done')
    } catch (err) {
      await supabase.rpc('set_onboarding_state', { p_state: 'awaiting_url', p_crawl_status: { finished: false } })
      setError(err instanceof Error ? err.message : 'The website could not be fully read or saved. Your current fields are kept; continue manually or retry.')
      setCrawlStep('idle')
    } finally {
      setBusy(false)
    }
  }

  const progressPercent = crawlStep === 'done' ? 100 : totalPages > 0 ? Math.min(100, Math.round((pagesRead / totalPages) * 100)) : 0
  const activeStep = crawlStep === 'crawling' ? 0 : crawlStep === 'ai_analysis' ? 1 : 2

  const title =
    phase === 'choose'
      ? 'Let’s get to know your business.'
      : phase === 'website'
        ? busy
          ? 'Getting to know your business.'
          : 'Add your website'
        : phase === 'manual'
          ? 'Tell us about your business'
          : 'Your business is ready.'
  const subtitle =
    phase === 'choose'
      ? 'Choose how to set up your business. Your Marketing Director starts with this context.'
      : phase === 'website'
        ? busy
          ? 'We’re turning your website into a starting point for your Marketing Director.'
          : 'Add your website so your Marketing Director starts with context about your company.'
        : phase === 'manual'
          ? 'Add your details yourself. You can save a draft and finish later.'
          : 'Your setup is saved. Choose how you’d like to continue.'

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      eyebrow={
        <div className="flex items-center gap-2 text-xs font-medium text-primary-700">
          <CheckCircle2 size={16} />
          <span>{phase === 'done' ? 'Ready to explore' : 'Workspace created'}<span className="mx-2 text-ink-300">/</span>Your business</span>
        </div>
      }
      panel={<BusinessContextPanel />}
      
    >
      {phase === 'done' && qualityNotice && (
        <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          {qualityNotice}
        </p>
      )}

      {conflict && phase !== 'choose' && phase !== 'website' && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <p>This draft changed in another session. Reload to see the latest version before continuing.</p>
          <button type="button" onClick={() => void reloadAfterConflict()} className="mt-2 font-semibold underline">
            Reload draft
          </button>
        </div>
      )}

      {phase === 'choose' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => { setPath('website'); setError(null); setPhase('website') }}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-start transition hover:border-primary-300 hover:bg-primary-50/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Globe size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">Website</span>
              <span className="mt-0.5 block text-xs leading-5 text-ink-500">Read your public website and turn it into an editable draft.</span>
            </span>
            <ArrowRight size={18} className="shrink-0 text-ink-400" />
          </button>
          <button
            type="button"
            onClick={() => { setPath('manual'); setError(null); setPhase('manual') }}
            className="flex w-full items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-start transition hover:border-primary-300 hover:bg-primary-50/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><PenLine size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">Manual</span>
              <span className="mt-0.5 block text-xs leading-5 text-ink-500">Enter your business details yourself.</span>
            </span>
            <ArrowRight size={18} className="shrink-0 text-ink-400" />
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="flex w-full cursor-not-allowed items-center gap-4 rounded-2xl border border-ink-200 bg-ink-50 p-4 text-start opacity-60"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-400"><Share2 size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink-500">Social import
                <span className="rounded-full bg-ink-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-600">Coming soon</span>
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-ink-400">Import from your social profiles.</span>
            </span>
          </button>
        </div>
      )}

      {phase === 'website' && (busy ? (
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
          <p className="text-center text-xs leading-5 text-ink-500">Keep this page open while we gather your business context.</p>
        </div>
      ) : (
        <form onSubmit={startCrawl} noValidate className="space-y-6">
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
            <div className="mt-3 flex items-center justify-center gap-2">
              <button type="button" onClick={() => { setPath('manual'); setPhase('manual') }} className="flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-primary-600 transition hover:text-primary-700">
                Complete manually
              </button>
              <span className="text-ink-300">·</span>
              <button type="button" onClick={() => router.push('/brain')} className="flex min-h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-ink-600 transition hover:text-primary-600">{t('skipForNow')}</button>
            </div>
          </div>
        </form>
      ))}

      {phase === 'manual' && (
        <form
          onSubmit={(e) => { e.preventDefault(); void confirmDraft() }}
          className="space-y-6"
        >
          <BusinessForm value={form} onChange={setForm} />
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</p>}
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>{saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : 'Draft'}</span>
            <button type="button" onClick={() => { setPhase('choose'); setError(null) }} className="font-medium text-ink-500 hover:text-primary-600">Back</button>
          </div>
          <div className="space-y-3">
            <button type="submit" className="btn-primary w-full">Finish setup<ArrowRight size={16} /></button>
            <button type="button" onClick={() => void saveManualDraft()} disabled={saveState === 'saving'} className="btn-secondary w-full">
              {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('save')}
            </button>
          </div>
        </form>
      )}

      {phase === 'done' && (
        <div className="space-y-6">
          {summary.pages > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {[
                { label: 'Pages read', value: summary.pages, icon: FileText },
                { label: 'Facts collected', value: summary.items, icon: Brain },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-ink-200 bg-white px-2 py-5 text-center">
                  <Icon size={18} className="mx-auto text-primary-500" />
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
                  <p className="mt-1 text-[11px] leading-4 text-ink-500 sm:text-xs">{label}</p>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-3">
            <button type="button" onClick={() => router.push('/employee')} className="btn-primary w-full">
              <MessageCircle size={18} />
              Contact the Director
              <ArrowRight size={16} />
            </button>
            <button type="button" onClick={() => router.push('/settings')} className="btn-secondary w-full">
              <CreditCard size={18} />
              Select a Plan
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
      <div className="relative z-10 ">
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