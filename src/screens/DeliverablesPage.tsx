'use client'

import { DeliverablesSkeleton } from '../components/skeletons'
import EmptyState from '../components/EmptyState'
import { useDialog } from '../hooks/useDialog'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocaleRouter as useRouter } from '@/context/I18nContext'
import { FolderOpen, X, Download, FileText, ArrowUpRight, Search, Copy, Pencil, Trash2, Send, History } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '../lib/supabase'
import { useCopy } from '../hooks/useCopy'
import { useAuth } from '../context/AuthContext'
import { formatWorkspaceTime } from '../lib/region'
import type { Deliverable, DeliverableVersion } from '../lib/types'
import MarkdownContent from '../components/chat/MarkdownContent'

const PAGE = 8
const types = ['all', 'research_report', 'competitor_analysis', 'content_posts', 'content_calendar', 'performance_diagnosis', 'general']

function slug(title: string) {
  return title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'document'
}

export default function DeliverablesPage() {
  const { t } = useCopy()
  const { settings } = useAuth()

  const originLabel = (origin: Record<string, unknown> | null | undefined) => {
    const kind = typeof origin?.kind === 'string' ? origin.kind : 'direct'
    if (kind === 'document') return t('originDocument')
    if (kind === 'wizard_question') return t('originDiscovery')
    if (kind === 'roadmap_step') return t('originRoadmapStep')
    return t('originSavedFromChat')
  }

  const plural = (one: string, many: string, count: number) => t((count === 1 ? one : many) as never, { count })

  const tz = settings?.timezone ?? 'UTC'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Deliverable[]>([])
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [listError, setListError] = useState('')
  const cursor = useRef<{ created_at: string; id: string } | null>(null)
  const loadGeneration = useRef(0)

  const [viewing, setViewing] = useState<Deliverable | null>(null)
  const [linked, setLinked] = useState<Deliverable | null>(null)
  const [versions, setVersions] = useState<DeliverableVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [starting, setStarting] = useState(false)

  const requestedDocument = searchParams.get('document')
  const shown = viewing ?? (requestedDocument
    ? linked?.id === requestedDocument ? linked : items.find((item) => item.id === requestedDocument) ?? null
    : null)
  const shownId = shown?.id ?? null
  const shownVersion = shown?.version ?? null

  const closeViewing = () => {
    setViewing(null)
    setLinked(null)
    setEditing(false)
    setActionError('')
    setNotice('')
    if (requestedDocument) {
      const next = new URLSearchParams(searchParams)
      next.delete('document')
      router.replace('?' + next.toString(), { scroll: false })
    }
  }

  useDialog(!!shown, closeViewing)

  // Search is debounced so typing does not issue one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // First page follows the active search/type/date filters. Each request has a
  // generation so a slow older response can never replace newer results.
  useEffect(() => {
    const generation = ++loadGeneration.current
    // Starting the external request is exactly what this effect is for.
    // eslint-disable-next-line react/set-state-in-effect
    setLoading(true)
    setListError('')
    void (async () => {
      const { data, error } = await supabase.rpc('list_deliverables', {
        p_search: debouncedSearch || null,
        p_type: filter === 'all' ? null : filter,
        p_from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
        p_to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString() : null,
        p_before: null,
        p_before_id: null,
        p_limit: PAGE,
      })
      if (generation !== loadGeneration.current) return
      if (error) {
        setListError(t('docsLoadFailed'))
        setItems([])
        setHasMore(false)
        cursor.current = null
      } else {
        const rows = (data ?? []) as Deliverable[]
        setItems(rows)
        setHasMore(rows.length === PAGE)
        cursor.current = rows.length ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id } : null
      }
      setLoading(false)
    })()
  }, [filter, debouncedSearch, from, to])

  // An exact link may point at a document outside the current page/filter.
  useEffect(() => {
    if (!requestedDocument) return
    let active = true
    void (async () => {
      const { data } = await supabase.from('deliverables').select('*').eq('id', requestedDocument).single()
      if (active) setLinked((data as Deliverable | null) ?? null)
    })()
    return () => { active = false }
  }, [requestedDocument])

  useEffect(() => {
    if (!shownId) return
    let active = true
    void (async () => {
      const { data, error } = await supabase
        .from('deliverable_versions')
        .select('*')
        .eq('deliverable_id', shownId)
        .order('version', { ascending: false })
      if (!active) return
      if (error) {
        setVersions([])
        setActionError(t('versionHistoryLoadFailed'))
      } else {
        setVersions((data ?? []) as DeliverableVersion[])
      }
      setSelectedVersion(shownVersion)
    })()
    return () => { active = false }
  }, [shownId, shownVersion])

  const filteredLabel = filter === 'all' ? t('navDeliverables') : t(`type_${filter}` as never)
  const loadedAll = !loading && !loadingMore && items.length === 0 && !debouncedSearch && filter === 'all' && !from && !to


  const loadMore = async () => {
    if (!cursor.current || loadingMore) return
    setLoadingMore(true)
    setListError('')
    const before = cursor.current
    const { data, error } = await supabase.rpc('list_deliverables', {
      p_search: debouncedSearch || null,
      p_type: filter === 'all' ? null : filter,
      p_from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      p_to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86400000).toISOString() : null,
      p_before: before.created_at,
      p_before_id: before.id,
      p_limit: PAGE,
    })
    if (error) {
      setListError(t('docsLoadMoreFailed'))
      setLoadingMore(false)
      return
    }
    const rows = (data ?? []) as Deliverable[]
    setItems((previous) => {
      const ids = new Set(previous.map((item) => item.id))
      return [...previous, ...rows.filter((row) => !ids.has(row.id))]
    })
    setHasMore(rows.length === PAGE)
    cursor.current = rows.length ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id } : null
    setLoadingMore(false)
  }

  const download = (item: { title: string; content: string }, format: 'md' | 'txt') => {
    const blob = new Blob([item.content], { type: format === 'md' ? 'text/markdown' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug(item.title)}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copy = async (item: { content: string }) => {
    try {
      await navigator.clipboard.writeText(item.content)
      setNotice(t('documentCopied'))
    } catch {
      setActionError(t('documentCopyFailed'))
    }
  }

  const startEdit = () => {
    if (!shown) return
    setEditing(true)
    setEditTitle(shown.title)
    setEditContent(shown.content)
    setActionError('')
    setNotice('')
  }

  const saveEdit = async () => {
    if (!shown || saving) return
    setSaving(true)
    setActionError('')
    const { data, error } = await supabase.rpc('update_deliverable', {
      p_deliverable_id: shown.id,
      p_expected_version: shown.version,
      p_title: editTitle,
      p_content: editContent,
    })
    if (error) {
      setActionError(error.message.includes('STALE_VERSION')
        ? t('docStaleBeforeSave')
        : error.message.includes('INVALID_DOCUMENT')
          ? t('docInvalidBeforeSave')
          : t('docSaveFailed'))
      setSaving(false)
      return
    }
    const saved = data as Deliverable
    setItems((previous) => previous.map((item) => item.id === saved.id ? saved : item))
    setViewing(saved)
    setLinked(null)
    setEditing(false)
    setSelectedVersion(saved.version)
    setNotice(t('docVersionSaved', { version: saved.version, previous: saved.version - 1 }))
    setSaving(false)
  }

  const remove = async (item: Deliverable) => {
    if (!confirm(t('confirmDeleteDoc', { title: item.title }))) return
    setActionError('')
    const { error } = await supabase.rpc('delete_deliverable', { p_deliverable_id: item.id, p_expected_version: item.version })
    if (error) {
      setActionError(error.message.includes('STALE_VERSION')
        ? t('docStaleBeforeDelete')
        : t('docDeleteFailed'))
      return
    }
    setItems((previous) => previous.filter((row) => row.id !== item.id))
    closeViewing()
  }

  const reuse = (item: Deliverable) => {
    const request = `Reuse this saved document as a starting point. Keep what is settled and improve what is not.\n\n${item.title}\n\n${item.content.slice(0, 2000)}`
    router.push(`/employee?compose=${encodeURIComponent(request)}`)
  }

  const continueWithDirector = async (item: Deliverable) => {
    if (starting) return
    setStarting(true)
    setActionError('')
    const { data: sessionData } = await supabase.auth.getSession()
    const workspaceId = sessionData.session?.user.id
    if (!workspaceId) {
      setActionError(t('sessionExpiredContinue'))
      setStarting(false)
      return
    }
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({ workspace_id: workspaceId, title: `Continue: ${item.title.slice(0, 60)}` })
      .select()
      .single()
    if (error || !conversation) {
      setActionError(t('continuationFailed'))
      setStarting(false)
      return
    }
    const request = `Continue from the saved document "${item.title}" (version ${item.version}). Build on it without repeating what is already settled.`
    router.push(`/employee?conversation=${conversation.id}&compose=${encodeURIComponent(request)}&document=${item.id}&version=${item.version}`)
  }

  const displayed = editedVersion(versions, selectedVersion, shown)
  const isCurrentVersion = !!shown && selectedVersion === shown.version

  return (
    <div className="workspace-page">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="brain-page-heading"><FolderOpen size={22} /></span>
          <div><h1 className="workspace-heading">{t('deliverablesTitle')}</h1><p className="workspace-description">{t('deliverablesDescription')}</p></div>
        </header>

        <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
          <label className="relative block">
            <span className="sr-only">{t('searchSavedDocs')}</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('searchTitleOrContent')} className="input-field w-full pl-9" />
          </label>
          <label className="text-xs text-ink-600">
            <span className="sr-only">{t('fromDate')}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label={t('fromDate')} className="input-field w-full" />
          </label>
          <label className="text-xs text-ink-600">
            <span className="sr-only">{t('toDate')}</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label={t('toDate')} className="input-field w-full" />
          </label>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-2 no-scrollbar sm:flex-wrap">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium shrink-0 transition-colors ${
                filter === type
                  ? 'border-primary-600 bg-primary-50 text-primary-800'
                  : 'border-ink-200 text-ink-600 hover:border-ink-300'
              }`}
            >
              {type === 'all' ? t('navDeliverables') : t(`type_${type}` as never)}
            </button>
          ))}
        </div>

        {listError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{listError}</p>}

        {loading ? (
          <DeliverablesSkeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={FolderOpen} title={loadedAll ? t('docsEmptyTitle') : t('docsNoMatchTitle')} description={loadedAll ? t('docsEmptyHint') : t('docsNoMatchHint')} action={loadedAll ? { to: '/employee', label: t('talkToDirector') } : undefined} />
        ) : (
          <>
            <p className="mb-3 text-xs text-ink-500">{plural('savedDocCountOne', 'savedDocCountMany', items.length)}{filter !== 'all' ? ` ${t('savedDocsInFilter', { label: filteredLabel })}` : ''}{hasMore ? ` ${t('savedDocsLoadedSoFar')}` : ''}</p>
            <div className="grid gap-5 md:grid-cols-2">
              {items.map((item) => (
                <div key={item.id} className="card animate-fade-up flex flex-col p-5 transition-shadow hover:shadow-card sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-500"><FileText size={21} /></span><span className="text-xs text-ink-600">{originLabel(item.origin)}</span></div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold leading-snug">{item.title}</h3>
                    <span className="badge shrink-0 bg-primary-50 text-primary-700">{t(`type_${item.type}` as never)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-sm text-ink-600">{item.content}</p>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-ink-100/60">
                    <span className="text-xs text-ink-400">{formatWorkspaceTime(item.created_at, tz, { dateStyle: 'medium', timeStyle: undefined })} · {t('versionShort', { version: item.version })}</span>
                    <div className="flex gap-2">
                      <button onClick={() => { setViewing(item); setNotice(''); setActionError('') }} className="btn-secondary px-3 py-1.5 text-xs">
                        {t('viewDeliverable')} <ArrowUpRight size={14} />
                      </button>
                      <button onClick={() => download(item, 'md')} className="btn-secondary px-3 py-1.5 text-xs">
                        <Download size={13} /> {t('download')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button onClick={() => void loadMore()} disabled={loadingMore} className="btn-secondary px-4 py-2 text-xs">
                   {loadingMore ? <><Spinner size={13} /> {t('loading')}</> : t('loadMoreDocs')}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {shown && displayed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={closeViewing}>
          <div role="dialog" aria-modal="true" aria-label={shown.title} className="card modal-panel flex max-h-[90vh] w-full max-w-3xl flex-col p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 pb-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-base sm:text-lg">{shown.title}</h3>
                  <span className="badge bg-primary-50 text-primary-700">{t(`type_${shown.type}` as never)}</span>
                  <span className="badge bg-ink-100 text-ink-700">{t('versionShort', { version: displayed.version })}</span>
                </div>
                <p className="mt-1 text-xs text-ink-500">{originLabel(shown.origin)} · {t('savedPrefix', { time: formatWorkspaceTime(shown.created_at, tz, { dateStyle: 'medium', timeStyle: undefined }) })} · {t('updatedPrefix', { time: formatWorkspaceTime(shown.updated_at ?? shown.created_at, tz, { dateStyle: 'medium', timeStyle: undefined }) })}</p>
                {shown.stale_reason && <p className="mt-1 text-xs text-amber-700">{shown.stale_reason}</p>}
              </div>
              <button aria-label={t('closeReport')} onClick={closeViewing} className="text-ink-400 hover:text-ink-700 p-1">
                <X size={18} />
              </button>
            </div>

            {versions.length > 1 && (
              <label className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-600">
                <History size={14} /> {t('viewVersion')}
                <select aria-label={t('documentVersion')} value={selectedVersion ?? shown.version} onChange={(event) => setSelectedVersion(Number(event.target.value))} className="input-field w-auto min-w-40 text-xs">
                  {versions.map((version) => <option key={version.id} value={version.version}>{t('versionShortCap', { version: version.version })}{version.version === shown.version ? t('versionCurrentSuffix') : ''}</option>)}
                </select>
                {!isCurrentVersion && <span className="text-ink-500">{t('readOnlyHistory')}</span>}
              </label>
            )}

            {actionError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
            {notice && <p role="status" className="mb-3 rounded-xl bg-primary-50 p-3 text-sm text-primary-800">{notice}</p>}

            {editing ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <label className="text-xs font-medium text-ink-700">{t('docTitleLabel')}<input value={editTitle} maxLength={200} onChange={(event) => setEditTitle(event.target.value)} className="input-field mt-1 w-full" /></label>
                <label className="flex min-h-0 flex-1 flex-col text-xs font-medium text-ink-700">{t('docContentLabel')}<textarea value={editContent} maxLength={80000} onChange={(event) => setEditContent(event.target.value)} className="input-field mt-1 min-h-56 flex-1 resize-y font-mono text-xs leading-relaxed" /></label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void saveEdit()} disabled={saving} className="btn-primary px-3 py-1.5 text-xs">{saving ? t('saving') : t('saveNewVersion')}</button>
                  <button onClick={() => { setEditing(false); setActionError(''); setEditContent(''); setEditTitle('') }} disabled={saving} className="btn-secondary px-3 py-1.5 text-xs">{t('cancel')}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 pb-1">
                  {isCurrentVersion && <button onClick={startEdit} className="btn-primary px-3 py-1.5 text-xs"><Pencil size={13} /> {t('edit')}</button>}
                  <button onClick={() => void copy(displayed)} className="btn-secondary px-3 py-1.5 text-xs"><Copy size={13} /> {t('copyLabel')}</button>
                  <button onClick={() => download(displayed, 'md')} className="btn-secondary px-3 py-1.5 text-xs"><Download size={13} /> .md</button>
                  <button onClick={() => download(displayed, 'txt')} className="btn-secondary px-3 py-1.5 text-xs"><Download size={13} /> .txt</button>
                  <button onClick={() => reuse(shown)} className="btn-secondary px-3 py-1.5 text-xs"><Send size={13} /> {t('reuse')}</button>
                  <button onClick={() => void continueWithDirector(shown)} disabled={starting} className="btn-secondary px-3 py-1.5 text-xs"><ArrowUpRight size={13} /> {starting ? t('starting') : t('continueWithDirector')}</button>
                  <button onClick={() => void remove(shown)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"><Trash2 size={13} /> {t('delete')}</button>
                </div>
                {(shown.source_refs?.length > 0 || shown.context_refs?.length > 0 || shown.limitations?.length > 0) && (
                  <p className="text-xs text-ink-500">{plural('sourceCountOne', 'sourceCountMany', shown.source_refs?.length ?? 0)} · {plural('contextRefCountOne', 'contextRefCountMany', shown.context_refs?.length ?? 0)} · {plural('limitationCountOne', 'limitationCountMany', shown.limitations?.length ?? 0)}</p>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-ink-100 p-3">
                  <MarkdownContent content={displayed.content} className="text-sm leading-relaxed text-ink-800" />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function editedVersion(versions: DeliverableVersion[], selected: number | null, document: Deliverable | null) {
  if (!document) return null
  if (selected !== null) {
    const found = versions.find((version) => version.deliverable_id === document.id && version.version === selected)
    if (found) return found
  }
  return {
    id: document.id,
    workspace_id: document.workspace_id,
    deliverable_id: document.id,
    version: document.version,
    title: document.title,
    content: document.content,
    provenance: document.origin,
    source_refs: document.source_refs ?? [],
    context_refs: document.context_refs ?? [],
    limitations: document.limitations ?? [],
    created_at: document.updated_at ?? document.created_at,
  } satisfies DeliverableVersion
}
