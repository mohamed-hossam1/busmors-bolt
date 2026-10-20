import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Globe,
  Brain,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Network,
  FileText,
  Check,
  Compass,
  Database,
  Layers,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LangContext'
import {
  extractKnowledgeFromSite,
  aiExtractKnowledge,
  aiExtractRelations,
  isAiExtractionAvailable,
} from '../lib/crawl'
import type { BrainCategory } from '../lib/types'

type CrawlStep = 'idle' | 'crawling' | 'ai_analysis' | 'linking' | 'done'

export default function Onboarding() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagesRead, setPagesRead] = useState(0)
  const [currentUrl, setCurrentUrl] = useState('')
  const [crawlStep, setCrawlStep] = useState<CrawlStep>('idle')
  const [progressStatus, setProgressStatus] = useState('')
  const [done, setDone] = useState(false)
  const [discoveredCategories, setDiscoveredCategories] = useState<string[]>([])
  const [summaryStats, setSummaryStats] = useState({ pages: 0, nodes: 0, edges: 0 })

  const calculateProgressPercent = () => {
    if (crawlStep === 'done') return 100
    if (crawlStep === 'linking') return 95
    if (crawlStep === 'ai_analysis') return 88
    if (crawlStep === 'crawling') {
      if (pagesRead === 0) return 15
      return Math.min(85, Math.round(15 + (pagesRead / 10) * 70))
    }
    return 0
  }

  const start = async (e: FormEvent) => {
    e.preventDefault()
    if (done) {
      navigate('/app/brain')
      return
    }

    const raw = url.trim()
    if (!raw) return

    // Auto prepend https:// if missing so domains like wesam.ai work seamlessly
    const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`

    try {
      const parsed = new URL(normalized)
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
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
    setDiscoveredCategories([])
    setCrawlStep('crawling')
    setProgressStatus('Connecting to website and discovering pages...')

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setError(t('errorGeneric'))
      setBusy(false)
      setCrawlStep('idle')
      return
    }

    await supabase
      .from('workspace_settings')
      .update({ company_url: normalized, onboarding_state: 'crawling' })
      .eq('workspace_id', userId)

    try {
      const result = await extractKnowledgeFromSite(
        normalized,
        (read, total, pageUrl) => {
          setPagesRead(read)
          if (pageUrl) setCurrentUrl(pageUrl)
          setProgressStatus(
            read > 0
              ? `Reading and analyzing page ${read} of ${total}...`
              : 'Discovering website structure and pages...'
          )
        },
        10
      )

      // Live category discovery tags from initial crawl
      const initialCats = Array.from(new Set(result.candidates.map((c) => c.category)))
      setDiscoveredCategories(initialCats)

      let candidates = result.candidates

      // Run AI extraction pass to produce clean, well-structured business knowledge
      if (await isAiExtractionAvailable()) {
        setCrawlStep('ai_analysis')
        setProgressStatus('AI is structuring business knowledge, offerings, and audience...')
        const aiCandidates = await aiExtractKnowledge(
          result.pages.map((p) => ({ url: p.url, markdown: p.markdown }))
        )
        if (aiCandidates.length > 0) {
          // AI candidates replace heuristic candidates as the gold standard
          candidates = aiCandidates
          const updatedCats = Array.from(new Set(candidates.map((c) => c.category)))
          setDiscoveredCategories(updatedCats)
        }
      }

      let edgeCount = 0

      if (candidates.length > 0) {
        // ALWAYS auto-approve crawled nodes into dataset directly without requiring user approval
        const rows = candidates.map((c) => ({
          workspace_id: userId,
          category: c.category,
          title: c.title,
          summary: c.summary,
          properties: c.properties,
          status: 'approved' as const, // AUTO-APPROVED DIRECTLY
          source: 'crawler' as const,
          source_detail: c.source_url,
          confidence: c.confidence,
        }))
        await supabase.from('brain_nodes').insert(rows)

        // Map relationships between the extracted nodes so the graph has edges
        const { data: inserted } = await supabase
          .from('brain_nodes')
          .select('id, category, title')
          .in('title', candidates.map((c) => c.title))

        if (inserted && inserted.length >= 2) {
          setCrawlStep('linking')
          setProgressStatus('Mapping relationships in your Business Brain...')
          const relations = await aiExtractRelations(
            inserted.map((n) => ({ category: n.category as BrainCategory, title: n.title }))
          )
          const byTitle = new Map(inserted.map((n) => [n.title.toLowerCase(), n.id]))
          const edgeRows = relations
            .map((r) => ({
              workspace_id: userId,
              source_node_id: byTitle.get(r.source_title.toLowerCase()),
              target_node_id: byTitle.get(r.target_title.toLowerCase()),
              relation_type: r.relation_type,
              status: 'approved' as const, // AUTO-APPROVED DIRECTLY
              weight: r.confidence,
            }))
            .filter(
              (e): e is typeof e & { source_node_id: string; target_node_id: string } =>
                Boolean(e.source_node_id) &&
                Boolean(e.target_node_id) &&
                e.source_node_id !== e.target_node_id
            )
          if (edgeRows.length > 0) {
            await supabase.from('brain_edges').insert(edgeRows)
            edgeCount = edgeRows.length
          }
        }

        // Record auto-approval in audit log
        await supabase.from('audit_log').insert({
          workspace_id: userId,
          action: 'crawler_knowledge_auto_approved',
          entity_type: 'brain_nodes',
          details: { count: candidates.length, edges: edgeCount, url },
        })

        await supabase
          .from('workspace_settings')
          .update({
            onboarding_state: 'complete',
            crawl_status: {
              pages_read: result.pages_read,
              nodes_count: candidates.length,
              edges_count: edgeCount,
              finished: true,
            },
          })
          .eq('workspace_id', userId)
      } else {
        await supabase
          .from('workspace_settings')
          .update({
            onboarding_state: 'complete',
            crawl_status: { pages_read: result.pages_read, finished: true },
          })
          .eq('workspace_id', userId)
      }

      setSummaryStats({
        pages: result.pages_read,
        nodes: candidates.length,
        edges: edgeCount,
      })
      setCrawlStep('done')
      setDone(true)
    } catch {
      await supabase
        .from('workspace_settings')
        .update({ onboarding_state: 'complete', crawl_status: { finished: true } })
        .eq('workspace_id', userId)
      setError(t('errorGeneric'))
      setCrawlStep('idle')
    } finally {
      setBusy(false)
    }
  }

  const progressPercent = calculateProgressPercent()

  return (
    <div className="flex min-h-screen min-h-[100dvh] items-center justify-center p-3.5 sm:p-6 bg-gradient-to-b from-ink-50 via-white to-primary-50/20">
      <div className="card w-full max-w-xl animate-fade-up p-4 sm:p-8 shadow-lift border border-ink-200/80 bg-white/95 backdrop-blur-sm">
        {!busy && !done ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <Brain size={22} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-ink-900">{t('welcome')}</h1>
                <span className="badge bg-primary-50 text-primary-700 text-[11px] font-semibold">
                  Automatic Brain Builder
                </span>
              </div>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              {t('onboardingIntro')}
            </p>

            <form onSubmit={start} noValidate className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink-700">
                  {t('websiteUrl')}
                </span>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-ink-400">
                    <Globe size={18} />
                  </div>
                  <input
                    type="text"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="company.com"
                    className="input-field ps-10 text-sm"
                    dir="ltr"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                  />
                </div>
                <p className="mt-1.5 text-xs text-ink-400">
                  ⚡ Reads up to 10 pages and auto-approves all extracted knowledge directly to your dataset.
                </p>
              </label>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 border border-red-200">
                  {error}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1 shadow-lift justify-center">
                  <Sparkles size={16} />
                  {t('startCrawl')}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/app/brain')}
                  className="btn-secondary justify-center"
                >
                  {t('skipForNow')}
                </button>
              </div>
            </form>
          </>
        ) : busy ? (
          /* Dynamic Crawling & Analysis Animation Screen */
          <div className="space-y-6 animate-fade-up py-3">
            {/* Radar / Scanner Visual */}
            <div className="relative flex flex-col items-center justify-center pt-2">
              <div className="relative flex items-center justify-center">
                {/* Concentric pulsing waves */}
                <div className="absolute h-28 w-28 rounded-full bg-primary-400/20 animate-ping [animation-duration:2.5s]" />
                <div className="absolute h-20 w-20 rounded-full bg-primary-500/25 animate-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary-600 to-primary-400 text-white shadow-xl shadow-primary-500/30">
                  {crawlStep === 'crawling' ? (
                    <Globe className="h-8 w-8 animate-spin [animation-duration:10s]" />
                  ) : crawlStep === 'ai_analysis' ? (
                    <Sparkles className="h-8 w-8 animate-bounce" />
                  ) : (
                    <Network className="h-8 w-8 animate-pulse" />
                  )}
                </div>
              </div>

              <div className="mt-5 text-center">
                <h3 className="text-lg font-bold text-ink-900">
                  Building your Business Brain
                </h3>
                <p className="text-xs text-ink-500 mt-1">{progressStatus}</p>
              </div>
            </div>

            {/* Dynamic Progress Bar */}
            <div className="space-y-2 rounded-2xl border border-ink-100 bg-ink-50/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-ink-700">
                <span className="flex items-center gap-1.5 text-primary-800">
                  <span className="h-2 w-2 rounded-full bg-primary-500 animate-pulse" />
                  {crawlStep === 'crawling' && `Scanning pages: ${pagesRead} of 10`}
                  {crawlStep === 'ai_analysis' && 'Extracting knowledge'}
                  {crawlStep === 'linking' && 'Linking relationships'}
                </span>
                <span className="font-mono text-primary-700 font-bold">
                  {progressPercent}%
                </span>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-ink-200/80">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary-600 via-primary-400 to-primary-500 transition-all duration-500 ease-out relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/25 animate-pulse" />
                </div>
              </div>

              {/* Real-time visited URL indicator */}
              {currentUrl && (
                <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-ink-200/60 bg-white px-3 py-1.5 font-mono text-[11px] text-ink-600 shadow-sm overflow-hidden">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  <span className="text-ink-400 shrink-0 font-sans font-medium">Fetching:</span>
                  <span className="truncate text-ink-700 font-mono" dir="ltr">
                    {currentUrl}
                  </span>
                </div>
              )}
            </div>

            {/* Micro Steps Flow */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div
                className={`rounded-xl border p-2.5 transition-all ${
                  crawlStep === 'crawling'
                    ? 'border-primary-400 bg-primary-50/70 text-primary-800 font-semibold shadow-sm'
                    : pagesRead > 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-ink-200 bg-white text-ink-400'
                }`}
              >
                <div className="flex justify-center mb-1">
                  {pagesRead > 0 && crawlStep !== 'crawling' ? (
                    <Check size={16} className="text-emerald-600" />
                  ) : (
                    <Compass size={16} className={crawlStep === 'crawling' ? 'animate-spin' : ''} />
                  )}
                </div>
                <span>Scan 10 Pages</span>
              </div>

              <div
                className={`rounded-xl border p-2.5 transition-all ${
                  crawlStep === 'ai_analysis'
                    ? 'border-primary-400 bg-primary-50/70 text-primary-800 font-semibold shadow-sm'
                    : crawlStep === 'linking' || crawlStep === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-ink-200 bg-white text-ink-400'
                }`}
              >
                <div className="flex justify-center mb-1">
                  {crawlStep === 'linking' || crawlStep === 'done' ? (
                    <Check size={16} className="text-emerald-600" />
                  ) : (
                    <Brain size={16} className={crawlStep === 'ai_analysis' ? 'animate-pulse' : ''} />
                  )}
                </div>
                <span>AI Extraction</span>
              </div>

              <div
                className={`rounded-xl border p-2.5 transition-all ${
                  crawlStep === 'linking'
                    ? 'border-primary-400 bg-primary-50/70 text-primary-800 font-semibold shadow-sm'
                    : crawlStep === 'done'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-ink-200 bg-white text-ink-400'
                }`}
              >
                <div className="flex justify-center mb-1">
                  {crawlStep === 'done' ? (
                    <Check size={16} className="text-emerald-600" />
                  ) : (
                    <Database size={16} className={crawlStep === 'linking' ? 'animate-pulse' : ''} />
                  )}
                </div>
                <span>Auto-Approve</span>
              </div>
            </div>

            {/* Discovered Knowledge Categories Stream */}
            {discoveredCategories.length > 0 && (
              <div className="animate-fade-up">
                <span className="block text-[11px] font-semibold text-ink-500 mb-1.5">
                  Discovered knowledge categories:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {discoveredCategories.map((cat) => (
                    <span
                      key={cat}
                      className="badge bg-primary-100 text-primary-800 border border-primary-200/60 text-[11px]"
                    >
                      <Layers size={11} className="me-1 text-primary-600" />
                      {t(`cat_${cat}` as never) || cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Finished & Auto-Approved Success Screen */
          <div className="space-y-6 animate-fade-up py-2">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-500/25 mb-3 animate-fade-up">
                <CheckCircle2 size={36} />
              </div>
              <h2 className="text-2xl font-bold text-ink-900">
                Business Brain Built Successfully!
              </h2>
              <p className="mt-1 text-sm text-ink-600 max-w-md">
                Website knowledge was extracted and approved directly into your dataset without requiring manual review.
              </p>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 text-center shadow-sm">
                <div className="flex items-center justify-center text-primary-600 mb-1">
                  <FileText size={18} />
                </div>
                <div className="text-xl font-bold text-ink-900">{summaryStats.pages}</div>
                <div className="text-xs text-ink-500 mt-0.5">Pages Read</div>
              </div>

              <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3.5 text-center shadow-sm">
                <div className="flex items-center justify-center text-primary-700 mb-1">
                  <Brain size={18} />
                </div>
                <div className="text-xl font-bold text-primary-900">{summaryStats.nodes}</div>
                <div className="text-xs text-primary-700 font-semibold mt-0.5">
                  Approved Knowledge
                </div>
              </div>

              <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-3.5 text-center shadow-sm">
                <div className="flex items-center justify-center text-accent-600 mb-1">
                  <Network size={18} />
                </div>
                <div className="text-xl font-bold text-ink-900">{summaryStats.edges}</div>
                <div className="text-xs text-ink-500 mt-0.5">Graph Relations</div>
              </div>
            </div>

            {/* Auto-Approved Confirmation Highlight */}
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-900">
              <Check size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold">Directly Active Dataset:</strong>
                All nodes and relations are approved and immediately available for your AI Marketing Employee and Knowledge Graph.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/app/brain')}
                className="btn-primary flex-1 py-3 text-sm shadow-lift flex items-center justify-center gap-2"
              >
                <span>Explore Brain</span>
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/app/employee')}
                className="btn-secondary py-3 text-sm flex items-center justify-center gap-2"
              >
                <Sparkles size={16} />
                <span>Marketing Employee</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
