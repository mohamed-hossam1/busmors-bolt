'use client'

import { useCallback, useEffect, useState } from 'react'
import { Link } from '@/shared/i18n'
import type { AdminTraceListResult } from './types'
import { formatDateTime, formatNumber } from './format'

const PAGE_SIZE = 20

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  interrupted: 'bg-orange-100 text-orange-700',
  running: 'bg-primary-100 text-primary-700',
  queued: 'bg-ink-100 text-ink-600',
  direct: 'bg-emerald-100 text-emerald-700',
  brain: 'bg-primary-100 text-primary-700',
  task: 'bg-indigo-100 text-indigo-700',
  refuse: 'bg-red-100 text-red-700',
}

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-ink-100 text-ink-600'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>{status || 'unknown'}</span>
}

export default function AdminTraceList() {
  const [result, setResult] = useState<AdminTraceListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [route, setRoute] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (q.trim()) params.set('q', q.trim())
      if (status) params.set('status', status)
      if (route) params.set('route', route)
      const response = await fetch(`/api/admin/traces?${params.toString()}`, { signal, cache: 'no-store' })
      if (!response.ok) throw new Error(`Request failed (${response.status})`)
      const data = (await response.json()) as AdminTraceListResult
      setResult(data)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to load traces')
    } finally {
      setLoading(false)
    }
  }, [page, q, status, route])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Execution Observability</h1>
          <p className="mt-1 text-sm text-ink-500">Traces captured across the Orchestrator, Director and research pipeline.</p>
        </div>
        <div className="text-sm text-ink-500">{formatNumber(total)} trace(s)</div>
      </header>

      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault()
          setPage(1)
          void load()
        }}
      >
        <label className="flex min-w-[220px] flex-1 flex-col text-xs font-medium text-ink-600">
          Search
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Request or reply text"
            className="mt-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-900 outline-none focus:border-primary-400"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-ink-600">
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-900">
            <option value="">All</option>
            {['completed', 'partial', 'failed', 'interrupted', 'error'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-ink-600">
          Route
          <select value={route} onChange={(event) => setRoute(event.target.value)} className="mt-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-900">
            <option value="">All</option>
            {['direct', 'brain', 'task'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-600">
          Apply
        </button>
      </form>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4 overflow-hidden rounded-xl border border-ink-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-2 font-semibold">Started</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Route</th>
              <th className="px-4 py-2 font-semibold">Request</th>
              <th className="px-4 py-2 text-right font-semibold">LLM tokens</th>
              <th className="px-4 py-2 text-right font-semibold">Model calls</th>
              <th className="px-4 py-2 text-right font-semibold">Tools</th>
              <th className="px-4 py-2 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-ink-500">Loading…</td>
              </tr>
            )}
            {!loading && result?.data.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-ink-500">No traces captured yet.</td>
              </tr>
            )}
            {!loading && result?.data.map((trace) => (
              <tr key={trace.id} className="border-t border-ink-100 align-top hover:bg-ink-50/60">
                <td className="whitespace-nowrap px-4 py-2 text-ink-600">{formatDateTime(trace.started_at)}</td>
                <td className="px-4 py-2"><StatusPill status={trace.status} /></td>
                <td className="px-4 py-2 text-ink-600">{trace.route ?? '—'}</td>
                <td className="max-w-[320px] px-4 py-2">
                  <Link href={`/admin/traces/${trace.id}`} className="line-clamp-2 font-medium text-primary-700 hover:text-primary-900">
                    {trace.request || '(no request)'}
                  </Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatNumber(trace.llm_total_tokens)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatNumber(trace.model_call_count)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-700">{formatNumber(trace.tool_call_count)}</td>
                <td className="px-4 py-2">
                  {trace.has_admin_trace ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">captured</span>
                  ) : trace.has_task ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">reconstructed</span>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-ink-600">
        <span>Page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-lg border border-ink-200 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((value) => value + 1)}
            className="rounded-lg border border-ink-200 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}