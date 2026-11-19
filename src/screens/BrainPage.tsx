'use client'

import LoadingState from '../components/LoadingState'
import { useDialog } from '../hooks/useDialog'
import { useMemo, useRef, useState } from 'react'
import {
  Brain as BrainIcon,
  Plus,
  History,
  Network,
  List,
  Sparkles,
  Trash2,
  Pencil,
  Loader2,
  Globe,
  AlertCircle,
  CheckCircle2,
  Search,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCopy } from '../hooks/useCopy'
import { useAuth } from '../context/AuthContext'
import DeleteKnowledgeDialog from '../components/brain/DeleteKnowledgeDialog'
import type { AuditEntry, BrainCategory, BrainEdge, BrainNode, BrainProposal } from '../lib/types'
import BrainGraph from '../components/brain/BrainGraph'
import NodeEditor from '../components/brain/NodeEditor'
import KnowledgeEvidence, { KnowledgeLabels } from '../components/brain/KnowledgeEvidence'
import ProposalReview from '../components/brain/ProposalReview'
import RelationshipEditor from '../components/brain/RelationshipEditor'
import { brainError, saveBrainItem } from '../lib/brainApi'
import { organizeBrainWithAi } from '../lib/crawl'

const ALL_CATEGORIES: BrainCategory[] = [
  'company_profile',
  'offering',
  'audience',
  'brand_rule',
  'positioning',
  'strategic_goal',
  'channel',
  'competitor',
  'company_fact',
]

const CATEGORY_STYLES: Record<string, string> = {
  company_profile: 'bg-teal-50 text-teal-800 border-teal-200',
  offering: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  audience: 'bg-amber-50 text-amber-800 border-amber-200',
  brand_rule: 'bg-orange-50 text-orange-800 border-orange-200',
  positioning: 'bg-purple-50 text-purple-800 border-purple-200',
  strategic_goal: 'bg-blue-50 text-blue-800 border-blue-200',
  channel: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  competitor: 'bg-rose-50 text-rose-800 border-rose-200',
  company_fact: 'bg-slate-100 text-slate-800 border-slate-200',
}

export default function BrainPage({ initial }: { initial: { nodes: BrainNode[]; edges: BrainEdge[]; audit: AuditEntry[]; proposals: BrainProposal[] } }) {
  const { t } = useCopy()
  const { session } = useAuth()
  const deletePreferenceKey = `busmora:skip-knowledge-delete-confirmation:${session?.user.id ?? 'anonymous'}`
  const skippedDeletePrompts = useRef(new Set<string>())
  const [pendingDelete, setPendingDelete] = useState<BrainNode | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pageError,setPageError] = useState('')
  const [evidence,setEvidence] = useState<BrainNode|null>(null)
  const [relationships,setRelationships] = useState(false)
  const [proposals,setProposals] = useState<BrainProposal[]>(initial.proposals)
  const [nodes, setNodes] = useState<BrainNode[]>(initial.nodes)
  const [edges, setEdges] = useState<BrainEdge[]>(initial.edges)
  const [audit, setAudit] = useState<AuditEntry[]>(initial.audit)
  const [view, setView] = useState<'list' | 'graph'>('list')
  const [editing, setEditing] = useState<BrainNode | 'new' | null>(null)
  const [showAudit, setShowAudit] = useState(false)
  const [loading, setLoading] = useState(false)

  // Filter & Search state
  const [filterTab, setFilterTab] = useState<'all' | 'approved' | 'candidate'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Re-organize with AI state
  const [showReorganizeModal, setShowReorganizeModal] = useState(false)
  const [reorganizeUrl, setReorganizeUrl] = useState('')
  const [reorganizing, setReorganizing] = useState(false)
  const [reorganizeStatus, setReorganizeStatus] = useState('')
  const [reorganizeError, setReorganizeError] = useState<string | null>(null)
  const [successBanner, setSuccessBanner] = useState<string | null>(null)

  useDialog(showReorganizeModal, () => { if (!reorganizing) setShowReorganizeModal(false) })

  const load = async () => {
    const results = await Promise.all([
      supabase.from('brain_nodes').select('*').order('created_at', { ascending: false }),
      supabase.from('brain_edges').select('*'),
      supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('brain_proposals').select('*').eq('status','pending').order('created_at',{ascending:false}),
    ])
    if(results.some(result=>result.error)) { setPageError('Some Brain records could not be loaded. Retry to see current knowledge.');setLoading(false);return }
    setNodes((results[0].data??[]) as BrainNode[])
    setEdges((results[1].data??[]) as BrainEdge[])
    setAudit((results[2].data??[]) as AuditEntry[])
    setProposals((results[3].data??[]) as BrainProposal[])
    setPageError('');setLoading(false)
  }


  const candidates = useMemo(() => nodes.filter((n) => n.status === 'candidate' && !proposals.some(p=>p.node_id===n.id)), [nodes,proposals])
  const approved = useMemo(() => nodes.filter((n) => n.status === 'approved'), [nodes])
  const pendingCount = proposals.length + candidates.length

  const filteredCandidates = useMemo(() => {
    return candidates.filter((n) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = !q || n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q)
      const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [candidates, searchQuery, selectedCategory])

  const filteredApproved = useMemo(() => {
    return approved.filter((n) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch = !q || n.title.toLowerCase().includes(q) || n.summary.toLowerCase().includes(q)
      const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [approved, searchQuery, selectedCategory])

  const approvedByCategory = useMemo(() => {
    const groups = new Map<BrainCategory, BrainNode[]>()
    for (const node of filteredApproved) {
      const list = groups.get(node.category) ?? []
      list.push(node)
      groups.set(node.category, list)
    }
    return groups
  }, [filteredApproved])

  const setStatus = async (node: BrainNode, status: BrainNode['status']) => {
    try { await saveBrainItem(node,node.title,node.summary,node.category,node.properties,status);await load() }
    catch(error) { setPageError(error instanceof Error?error.message:'Could not save this decision.') }
  }

  const approveAllPending = async () => {
    try {
      setLoading(true)
      for (const p of proposals) {
        const { error: rpcErr } = await supabase.rpc('decide_brain_proposal', {
          p_proposal_id: p.id,
          p_expected_version: p.base_version,
          p_decision: 'approved',
          p_edit: null,
        })
        if (rpcErr) throw brainError(rpcErr)
      }
      for (const node of candidates) {
        await saveBrainItem(node, node.title, node.summary, node.category, node.properties, 'approved')
      }
      await load()
    } catch (err) {
      await load()
      setPageError(err instanceof Error ? err.message : 'Could not approve all pending items.')
    } finally {
      setLoading(false)
    }
  }

  const rejectAllPending = async () => {
    if (!confirm('Reject all pending items?')) return
    try {
      setLoading(true)
      for (const p of proposals) {
        const { error: rpcErr } = await supabase.rpc('decide_brain_proposal', {
          p_proposal_id: p.id,
          p_expected_version: p.base_version,
          p_decision: 'rejected',
          p_edit: null,
        })
        if (rpcErr) throw brainError(rpcErr)
      }
      for (const node of candidates) {
        await saveBrainItem(node, node.title, node.summary, node.category, node.properties, 'rejected')
      }
      await load()
    } catch (err) {
      await load()
      setPageError(err instanceof Error ? err.message : 'Could not reject all pending items.')
    } finally {
      setLoading(false)
    }
  }
  const approveAllCandidates = approveAllPending
  const rejectAllCandidates = rejectAllPending

  const performDelete = async (node: BrainNode, skipConfirmation = false) => {
    if (deletingId) return
    setDeletingId(node.id)
    setDeleteError(null)
    try {
      // The foreign keys cascade related edges in the same database operation.
      const { error } = await supabase.from('brain_nodes').delete().eq('id', node.id)
      if (error) throw error
      if (skipConfirmation) {
        skippedDeletePrompts.current.add(deletePreferenceKey)
        try { localStorage.setItem(deletePreferenceKey, 'true') } catch { /* Keep the preference for this session if storage is unavailable. */ }
      }
      setPendingDelete(null)
      setNodes((current) => current.filter((item) => item.id !== node.id))
      setEdges((current) => current.filter((edge) => edge.source_node_id !== node.id && edge.target_node_id !== node.id))
      // The deletion trigger records the actor, cleans proposals and holds dependent Posts atomically.
      void load()
    } catch {
      setDeleteError('Could not delete this knowledge card. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  const deleteNode = (node: BrainNode) => {
    if (deletingId) return
    setDeleteError(null)
    let skip = skippedDeletePrompts.current.has(deletePreferenceKey)
    try { skip ||= localStorage.getItem(deletePreferenceKey) === 'true' } catch { /* Browser storage is optional. */ }
    if (skip) void performDelete(node)
    else setPendingDelete(node)
  }

  const saveEdit = async (node: BrainNode, title: string, summary: string, category: BrainCategory, properties: Record<string,unknown>) => {
    await saveBrainItem(node,title,summary,category,properties)
    setEditing(null);await load()
  }
  const addManual = async (title: string, summary: string, category: BrainCategory, properties: Record<string,unknown>) => {
    await saveBrainItem(null,title,summary,category,properties)
    setEditing(null);await load()
  }

  const openReorganizeModal = async () => {
    setReorganizeError(null)
    setReorganizeStatus('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (userId) {
        const { data } = await supabase
          .from('workspace_settings')
          .select('company_url')
          .eq('workspace_id', userId)
          .maybeSingle()
        if (data?.company_url) {
          setReorganizeUrl(data.company_url)
        }
      }
    } catch {
      // ignore
    }
    setShowReorganizeModal(true)
  }

  const handleReorganize = async () => {
    const raw = reorganizeUrl.trim()
    if (!raw) {
      setReorganizeError('Please enter a website address')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setReorganizeError('Not authenticated')
      return
    }

    const normalized = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
    setReorganizing(true)
    setReorganizeError(null)
    setReorganizeStatus('Connecting to website and reading pages...')

    const res = await organizeBrainWithAi(normalized, userId, (statusOrEvent: any) => {
      const text = typeof statusOrEvent === 'string' ? statusOrEvent : (statusOrEvent?.message ?? 'Connecting to website and reading pages...')
      setReorganizeStatus(text)
    })

    if (!res.success) {
      setReorganizeError(res.error || 'Failed to reorganize Business Brain')
      setReorganizing(false)
    } else {
      setReorganizing(false)
      setShowReorganizeModal(false)
      setSuccessBanner(res.warning || t('reorganizeSuccess'))
      setTimeout(() => setSuccessBanner(null), 5000)
      void load()
    }
  }

  return (
    <div className="workspace-page">
      <div className={`mx-auto ${view === 'graph' ? 'brain-graph-page max-w-none' : 'max-w-5xl'}`}>
        {successBanner && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 animate-fade-in">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
        )}

        {pageError&&<div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{pageError}</p><button className="mt-2 underline" onClick={()=>void load()}>Reload Brain</button></div>}
        {evidence&&<KnowledgeEvidence node={evidence} onClose={()=>setEvidence(null)}/>}
        {relationships&&<RelationshipEditor nodes={nodes} edges={edges} onClose={()=>setRelationships(false)} onChanged={load}/>}
        {deleteError && !pendingDelete && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{deleteError}</p>}
        <header className="brain-page-header">
          <div className="flex items-center gap-3">
            <span className="brain-page-heading"><BrainIcon size={23} /></span>
            <div>
              <h1 className="workspace-heading">{t('navBrain')}</h1>
              <p className="workspace-description">Your business knowledge, connected.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <div className="flex rounded-lg border border-ink-200 p-0.5 bg-white shrink-0">
              <button
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  view === 'list' ? 'bg-primary-50 text-primary-800' : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                <List size={15} /> {t('listView')}
              </button>
              <button
                onClick={() => setView('graph')}
                aria-pressed={view === 'graph'}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  view === 'graph' ? 'bg-primary-50 text-primary-800' : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                <Network size={15} /> {t('graphView')}
              </button>
            </div>
            <button className="btn-secondary px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0 inline-flex items-center gap-1.5" onClick={()=>setRelationships(true)}><Network size={15}/>Relationships</button>
            <button
              onClick={openReorganizeModal}
              className="btn-secondary px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 text-primary-700 border-primary-200 hover:bg-primary-50"
              title={t('reorganizeAiDesc')}
            >
              <Sparkles size={15} className="text-primary-600" /> {t('reorganizeAi')}
            </button>
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="btn-secondary px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            >
              <History size={15} /> {t('auditLog')}
            </button>
            <button
              onClick={() => setEditing('new')}
              className="btn-primary px-3.5 py-1.5 text-xs sm:text-sm whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus size={15} /> {t('addKnowledge')}
            </button>
          </div>
        </header>

        {showAudit && (
          <div className="card mb-6 p-4">
            <h3 className="mb-3 text-sm font-bold text-ink-700">{t('auditLog')}</h3>
            <div className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
              {audit.length === 0 && <p className="text-ink-400">—</p>}
              {audit.map((entry) => (
                <div key={entry.id} className="flex justify-between rounded-md bg-ink-50 px-3 py-1.5">
                  <span className="text-ink-700">{entry.action.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-ink-400">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'graph' ? (
          <BrainGraph
            nodes={nodes.filter((node) => !['rejected','retired'].includes(node.status))}
            edges={edges}
            proposals={proposals}
            onEditNode={(node) => setEditing(node)}
            onEvidence={setEvidence}
            onSwitchToList={() => { setView('list'); setFilterTab('candidate') }}
          />
        ) : loading ? (
          <LoadingState label="Loading your Business Brain…" />
        ) : (
          <div className="space-y-6">
            {/* Filter and Search Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-ink-200 shadow-2xs">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    filterTab === 'all'
                      ? 'bg-primary-600 text-white shadow-xs'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                  }`}
                >
                  <span>{t('allKnowledgeFilter')}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      filterTab === 'all' ? 'bg-primary-800 text-primary-100' : 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    {nodes.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterTab('approved')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                    filterTab === 'approved'
                      ? 'bg-primary-600 text-white shadow-xs'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                  }`}
                >
                  <span>{t('approvedFilter')}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                      filterTab === 'approved' ? 'bg-primary-800 text-primary-100' : 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    {approved.length}
                  </span>
                </button>

                {pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterTab('candidate')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                      filterTab === 'candidate'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200/60'
                    }`}
                  >
                    <span>{t('pendingFilter')}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        filterTab === 'candidate' ? 'bg-amber-800 text-amber-100' : 'bg-amber-200 text-amber-900'
                      }`}
                    >
                      {pendingCount}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-1 md:max-w-md justify-end">
                <div className="relative flex-1">
                  <Search className="absolute start-2.5 top-2.5 text-ink-400" size={14} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('searchKnowledgePlaceholder')}
                    className="w-full rounded-lg border border-ink-200 bg-white py-1.5 ps-8 pe-7 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute end-2 top-2 text-ink-400 hover:text-ink-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded-lg border border-ink-200 bg-white py-1.5 px-2 text-xs text-ink-700 focus:border-primary-500 focus:outline-none shrink-0"
                >
                  <option value="all">{t('allCategoriesFilter')}</option>
                  {ALL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {t(`cat_${cat}` as never)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(filterTab==='all'||filterTab==='candidate')&&<ProposalReview proposals={proposals.filter(p=>(selectedCategory==='all'||p.diff.category===selectedCategory)&&(!searchQuery||`${p.diff.title} ${p.diff.summary}`.toLowerCase().includes(searchQuery.toLowerCase())))} nodes={nodes} onChanged={load}/>}
            {/* Completely Empty State */}
            {candidates.length === 0 && approved.length === 0 && proposals.length === 0 && (
              <div className="card p-8 text-center text-sm text-ink-500">
                <p className="mb-3">{t('noCandidates')}</p>
                <button
                  onClick={openReorganizeModal}
                  className="btn-primary inline-flex items-center gap-2 mx-auto text-xs sm:text-sm"
                >
                  <Sparkles size={15} /> {t('reorganizeAi')}
                </button>
              </div>
            )}

            {/* 1. Pending Review Section (Shown when filter is 'all' or 'candidate') */}
            {(filterTab === 'all' || filterTab === 'candidate') && (
              <>
                {filteredCandidates.length > 0 ? (
                  <section className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 sm:p-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/70 pb-3 mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                          <AlertCircle size={17} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm sm:text-base font-bold text-ink-900">{t('pendingReviewTitle')}</h2>
                            <span className="badge bg-amber-100 text-amber-800 text-xs">
                              {filteredCandidates.length} {t('candidatesBadge')}
                            </span>
                          </div>
                          <p className="text-xs text-ink-500 mt-0.5">{t('pendingReviewSubtitle')}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={approveAllCandidates}
                          className="btn-primary bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs inline-flex items-center gap-1.5 shadow-xs"
                        >
                          <CheckCircle2 size={14} />
                          <span>{t('approveAllPending')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={rejectAllCandidates}
                          className="btn-secondary px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 border-red-200 inline-flex items-center gap-1.5"
                        >
                          <X size={14} />
                          <span>{t('rejectAllPending')}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {filteredCandidates.map((node) => (
                        <CandidateCard
                          key={node.id}
                          node={node}
                          onApprove={() => setStatus(node, 'approved')}
                          onReject={() => setStatus(node, 'rejected')}
                          onEdit={() => setEditing(node)}
                        />
                      ))}
                    </div>
                  </section>
                ) : filterTab === 'candidate' && proposals.length === 0 ? (
                  <div className="card p-8 text-center text-sm text-ink-500">
                    <p>{t('noCandidates')}</p>
                  </div>
                ) : null}
              </>
            )}

            {/* 2. Approved Knowledge Base (Always shown when filter is 'all' or 'approved') */}
            {(filterTab === 'all' || filterTab === 'approved') && (
              <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-ink-100 pb-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-ink-900">{t('approvedKnowledgeTitle')}</h2>
                    <span className="badge bg-primary-100 text-primary-800 text-xs font-semibold">
                      {filteredApproved.length}
                    </span>
                  </div>
                  {filteredApproved.length > 0 && (
                    <span className="text-xs text-ink-400">
                      {approvedByCategory.size} {approvedByCategory.size === 1 ? 'category' : 'categories'}
                    </span>
                  )}
                </div>

                {filteredApproved.length === 0 ? (
                  <div className="card p-8 text-center text-sm text-ink-500">
                    {searchQuery || selectedCategory !== 'all' ? (
                      <p>{t('noApprovedFound')}</p>
                    ) : (
                      <div>
                        <p className="mb-3">{t('noApprovedKnowledge')}</p>
                        <button
                          onClick={() => setEditing('new')}
                          className="btn-primary inline-flex items-center gap-1.5 text-xs sm:text-sm"
                        >
                          <Plus size={15} /> {t('addKnowledge')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {[...approvedByCategory.entries()].map(([category, list]) => (
                      <div key={category}>
                        <div className="mb-2.5 flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                            {t(`cat_${category}` as never)}
                          </h3>
                          <span className="text-xs text-ink-400 font-medium">({list.length})</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {list.map((node) => (
                            <div
                              key={node.id}
                              className="card p-4 flex flex-col justify-between hover:shadow-sm transition-shadow"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-semibold text-ink-900 leading-snug">{node.title}</h4>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium border shrink-0 ${
                                      CATEGORY_STYLES[node.category] ?? 'bg-ink-100 text-ink-700 border-ink-200'
                                    }`}
                                  >
                                    {t(`cat_${node.category}` as never)}
                                  </span>
                                </div>
                                <p className="mt-1.5 text-sm text-ink-600 leading-relaxed">{node.summary}</p>
                                <KnowledgeLabels node={node}/>
                              </div>
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
                                <span className="text-xs text-ink-400 truncate max-w-[180px]" dir="ltr">
                                  {node.source_detail || node.source}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button onClick={()=>setEvidence(node)} className="rounded px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50" aria-label={`Evidence for ${node.title}`}>Evidence</button>
                                  <button
                                    onClick={() => setEditing(node)}
                                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                                    title={t('edit')}
                                  >
                                    <Pencil size={13} /> {t('edit')}
                                  </button>
                                  <button
                                    onClick={() => deleteNode(node)}
                                    disabled={deletingId !== null}
                                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                                    title={t('delete')}
                                  >
                                    <Trash2 size={13} /> {t('delete')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {pendingDelete && <DeleteKnowledgeDialog
        node={pendingDelete}
        busy={deletingId !== null}
        error={deleteError}
        onCancel={() => { if (!deletingId) { setPendingDelete(null); setDeleteError(null) } }}
        onConfirm={(skip) => { void performDelete(pendingDelete, skip) }}
      />}

      {/* Reorganize with AI Modal */}
      {showReorganizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm animate-fade-in">
          <div role="dialog" aria-modal="true" aria-label="Organize Business Brain" className="modal-panel w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-ink-200 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                <Sparkles size={18} />
              </div>
              <h2 className="text-lg font-bold text-ink-900">{t('reorganizeModalTitle')}</h2>
            </div>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              {t('reorganizeModalDesc')}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  {t('websiteUrl')}
                </label>
                <div className="relative">
                  <Globe className="absolute start-3 top-2.5 text-ink-400" size={16} />
                  <input
                    type="text"
                    value={reorganizeUrl}
                    onChange={(e) => setReorganizeUrl(e.target.value)}
                    placeholder="https://company.com"
                    disabled={reorganizing}
                    className="w-full rounded-lg border border-ink-200 bg-white py-2 ps-9 pe-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-60"
                    dir="ltr"
                  />
                </div>
              </div>

              {reorganizing && (
                <div className="rounded-lg bg-primary-50/70 p-3.5 border border-primary-200/70">
                  <div className="flex items-center gap-2 text-primary-800 text-sm font-medium">
                    <Loader2 size={16} className="animate-spin text-primary-600" />
                    <span>{reorganizeStatus || t('reorganizing')}</span>
                  </div>
                  <div className="mt-2.5 h-1.5 w-full bg-primary-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 rounded-full animate-pulse w-3/4" />
                  </div>
                </div>
              )}

              {reorganizeError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{reorganizeError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReorganizeModal(false)}
                  disabled={reorganizing}
                  className="btn-secondary px-3.5 py-2 text-sm"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleReorganize}
                  disabled={reorganizing || !reorganizeUrl.trim()}
                  className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5 shadow-sm"
                >
                  {reorganizing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      {t('reorganizing')}
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      {t('startReorganize')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <NodeEditor
          node={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={(title, summary, category, properties) =>
            editing === 'new' ? addManual(title, summary, category, properties) : saveEdit(editing, title, summary, category, properties)
          }
        />
      )}
    </div>
  )
}

function CandidateCard({
  node,
  onApprove,
  onReject,
  onEdit,
}: {
  node: BrainNode
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
}) {
  const { t } = useCopy()
  return (
    <div className="card animate-fade-up p-4 flex flex-col justify-between h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-ink-900 line-clamp-2 min-h-[44px] leading-snug" title={node.title}>{node.title}</h3>
          <span className="badge bg-ink-100 text-ink-600 shrink-0">{Math.round(node.confidence * 100)}%</span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600 line-clamp-2 min-h-[40px]" title={node.summary}>{node.summary}</p>
        <p className="mt-2 truncate text-xs text-ink-400" dir="ltr">
          {t('source')}: {node.source_detail ?? node.source}
        </p>
      </div>
      <div className="mt-auto pt-3 grid grid-cols-3 sm:flex gap-2">
        <button onClick={onApprove} className="btn-primary px-2.5 py-1.5 text-xs justify-center">
          {t('approve')}
        </button>
        <button onClick={onEdit} className="btn-secondary px-2.5 py-1.5 text-xs justify-center">
          {t('edit')}
        </button>
        <button onClick={onReject} className="btn-danger px-2.5 py-1.5 text-xs justify-center">
          {t('reject')}
        </button>
      </div>
    </div>
  )
}




