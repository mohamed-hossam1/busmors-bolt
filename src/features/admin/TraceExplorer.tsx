'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import type { AdminTraceListItem, AdminTraceListResult } from './types'
import { formatDateTime, formatDuration, formatTokens, snippet, statusClasses, traceDurationMs } from './format'
import {
  buildTraceSearchString,
  EMPTY_TRACE_FILTERS,
  parseTraceSearchParams,
  type TraceFilterFormState,
} from './traceQuery'

const STATUS_OPTIONS = ['', 'completed', 'partial', 'failed', 'running', 'queued']

export default function TraceExplorer() {
  const router = useRouter()
  const params = useParams<{ lang: string }>()
  const searchParams = useSearchParams()
  const lang = params?.lang ?? 'en'

  const filterKey = searchParams.toString()
  const { filters: applied, page, accountEmail } = useMemo(
    () => parseTraceSearchParams(searchParams),
    [searchParams],
  )

  const [draftState, setDraftState] = useState<{ key: string; values: TraceFilterFormState }>(() => ({
    key: filterKey,
    values: applied,
  }))
  const draft = draftState.key === filterKey ? draftState.values : applied

  const updateDraft = (updater: (current: TraceFilterFormState) => TraceFilterFormState) => {
    setDraftState((current) => {
      const base = current.key === filterKey ? current.values : applied
      return { key: filterKey, values: updater(base) }
    })
  }

  const [result, setResult] = useState<AdminTraceListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pageSize = 20

  const queryString = useMemo(() => {
    const sp = new URLSearchParams()
    sp.set('page', String(page))
    sp.set('pageSize', String(pageSize))
    if (applied.q) sp.set('q', applied.q)
    if (applied.status) sp.set('status', applied.status)
    if (applied.workspaceId) sp.set('workspaceId', applied.workspaceId)
    if (applied.from) sp.set('from', applied.from)
    if (applied.to) sp.set('to', applied.to)
    return sp.toString()
  }, [applied, page])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/traces?${queryString}`)
      const data = (await response.json()) as AdminTraceListResult & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Could not load traces.')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load traces.')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void load()
  }, [load])

  const navigateWithFilters = (nextFilters: TraceFilterFormState, nextPage: number, nextEmail: string) => {
    const qs = buildTraceSearchString(nextFilters, nextPage, nextEmail)
    router.push(qs ? `/${lang}/admin/traces?${qs}` : `/${lang}/admin/traces`)
  }

  const applyFilters = () => {
    const nextEmail = draft.workspaceId.trim() === applied.workspaceId ? accountEmail : ''
    navigateWithFilters(draft, 1, nextEmail)
  }

  const resetFilters = () => {
    setDraftState({ key: '', values: EMPTY_TRACE_FILTERS })
    router.push(`/${lang}/admin/traces`)
  }

  const clearWorkspaceFilter = () => {
    navigateWithFilters({ ...applied, workspaceId: '' }, 1, '')
  }

  const setPage = (nextPage: number) => {
    navigateWithFilters(applied, nextPage, accountEmail)
  }

  const detailQs = buildTraceSearchString(applied, page, accountEmail)

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rows = result?.data ?? []

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-ink-900">Trace Explorer</h1>
          <p className="text-xs text-ink-500">Read-only execution traces across all workspaces.</p>
        </div>
        <span className="text-xs text-ink-500">{total.toLocaleString('en-US')} traces</span>
      </header>

      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-ink-200 bg-white p-3"
        onSubmit={(e) => {
          e.preventDefault()
          applyFilters()
        }}
      >
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-ink-600">
          Search
          <span className="relative">
            <Search size={14} className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={draft.q}
              onChange={(e) => updateDraft((f) => ({ ...f, q: e.target.value }))}
              placeholder="Query or final reply"
              className="input-field w-full ps-8"
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Status
          <select
            value={draft.status}
            onChange={(e) => updateDraft((f) => ({ ...f, status: e.target.value }))}
            className="input-field"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option || 'all'} value={option}>
                {option || 'All'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          Workspace ID
          <input
            value={draft.workspaceId}
            onChange={(e) => updateDraft((f) => ({ ...f, workspaceId: e.target.value }))}
            placeholder="workspace…"
            className="input-field"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          From
          <input
            type="date"
            value={draft.from}
            onChange={(e) => updateDraft((f) => ({ ...f, from: e.target.value }))}
            className="input-field"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-600">
          To
          <input
            type="date"
            value={draft.to}
            onChange={(e) => updateDraft((f) => ({ ...f, to: e.target.value }))}
            className="input-field"
          />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary h-9 px-3 text-sm">
            Apply
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-ink-200 px-3 text-sm text-ink-600 hover:bg-ink-100"
          >
            Reset
          </button>
        </div>
      </form>

      {applied.workspaceId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-800">
          <span className="flex flex-wrap items-center gap-1.5">
            <span>Filtered by workspace:</span>
            {accountEmail && <strong className="font-semibold">{accountEmail}</strong>}
            <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-primary-900">
              {applied.workspaceId}
            </code>
          </span>
          <button
            type="button"
            onClick={clearWorkspaceFilter}
            className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-white px-2 py-0.5 font-medium text-primary-700 hover:bg-primary-100"
          >
            <X size={12} aria-hidden="true" /> Clear
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-ink-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2 text-start font-medium">Request</th>
              <th className="px-3 py-2 text-start font-medium">Status</th>
              <th className="px-3 py-2 text-start font-medium">Duration</th>
              <th className="px-3 py-2 text-start font-medium">Agents</th>
              <th className="px-3 py-2 text-start font-medium">Tokens</th>
              <th className="px-3 py-2 text-start font-medium">Started</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-400">
                  Loading traces…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-400">
                  No traces match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((trace) => (
                <TraceRow
                  key={trace.id}
                  trace={trace}
                  lang={lang}
                  onOpen={() =>
                    router.push(
                      detailQs
                        ? `/${lang}/admin/traces/${trace.id}?${detailQs}`
                        : `/${lang}/admin/traces/${trace.id}`,
                    )
                  }
                />
              ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between text-xs text-ink-500">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1 || loading}
            className="flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || loading}
            className="flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 disabled:opacity-40"
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </footer>
    </div>
  )
}

function TraceRow({ trace, onOpen }: { trace: AdminTraceListItem; lang: string; onOpen: () => void }) {
  const duration = traceDurationMs(trace.started_at, trace.completed_at)
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-t border-ink-100 align-top hover:bg-primary-50/40"
    >
      <td className="max-w-[24rem] px-3 py-2 text-ink-900">{snippet(trace.request)}</td>
      <td className="px-3 py-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(trace.status)}`}>
          {trace.status || '—'}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-ink-700">{formatDuration(duration)}</td>
      <td className="px-3 py-2 text-ink-700">{trace.agent_count}</td>
      <td className="whitespace-nowrap px-3 py-2 text-ink-700">{formatTokens(trace.llm_total_tokens)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-ink-500">{formatDateTime(trace.started_at)}</td>
    </tr>
  )
}