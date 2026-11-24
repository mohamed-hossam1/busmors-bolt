'use client'

import { useMemo } from 'react'
import { Link } from '@/shared/i18n'
import type { AdminTraceDetail as Detail } from './types'
import {
  buildExecutionTree,
  formatDateTime,
  formatDuration,
  formatNumber,
  isRecord,
  summarizeByAttempt,
  toFallbackGraphEvents,
  toGraphEvents,
  toTimelineItem,
  type ExecutionNode,
  type TimelineItem,
} from './format'

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-ink-900">{value}</div>
      {hint && <div className="text-[11px] text-ink-400">{hint}</div>}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const style =
    status === 'completed' || status === 'direct'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'partial'
        ? 'bg-amber-100 text-amber-800'
        : status === 'failed' || status === 'error' || status === 'refuse'
          ? 'bg-red-100 text-red-700'
          : 'bg-ink-100 text-ink-600'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}>{status || 'unknown'}</span>
}

const KIND_STYLE: Record<TimelineItem['kind'], string> = {
  model: 'bg-primary-100 text-primary-700',
  tool: 'bg-amber-100 text-amber-800',
  skill: 'bg-purple-100 text-purple-700',
  agent: 'bg-ink-100 text-ink-600',
}

function Payload({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null
  return (
    <details className="mt-1 text-[11px] text-ink-600">
      <summary className="cursor-pointer select-none">{label}</summary>
      <pre className="mt-1 max-h-48 overflow-auto rounded bg-ink-50 p-2 text-[10px] text-ink-700">{safeStringify(value)}</pre>
    </details>
  )
}

function EventRow({ item }: { item: TimelineItem }) {
  const meta = (item.metadata ?? {}) as Record<string, unknown>
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${KIND_STYLE[item.kind]}`}>{item.kind}</span>
        <span className="font-semibold text-ink-900">{item.label}</span>
        {item.detail && <span className="text-xs text-ink-500">{item.detail}</span>}
        <StatusPill status={item.status} />
        {item.fallbackUsed && <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">fallback</span>}
        {item.retryAttempt !== null && item.retryAttempt !== undefined && item.retryAttempt > 0 && (
          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">retry {item.retryAttempt}</span>
        )}
        {item.attempt !== null && item.attempt !== undefined && (
          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">attempt {item.attempt}</span>
        )}
        {typeof meta.version === 'string' && <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] text-purple-600">v{meta.version}</span>}
        <span className="ml-auto text-[11px] text-ink-400">
          {formatDateTime(item.startedAt)} · {formatDuration(item.durationMs)}
        </span>
      </div>
      {item.tokens && (
        <div className="mt-1 text-[11px] text-ink-500">
          {item.usageKnown === false ? (
            <span>tokens: unknown</span>
          ) : (
            <>
              tokens: {formatNumber(item.tokens.input)} in / {formatNumber(item.tokens.output)} out / {formatNumber(item.tokens.total)} total
              {item.tokens.cached > 0 && ` · ${formatNumber(item.tokens.cached)} cached`}
              {item.tokens.reasoning > 0 && ` · ${formatNumber(item.tokens.reasoning)} reasoning`}
            </>
          )}
        </div>
      )}
      {isRecord(meta.cost) && (
        <div className="mt-1 text-[11px] text-ink-500">
          cost: {String((meta.cost as Record<string, unknown>).amount)} {String((meta.cost as Record<string, unknown>).currency ?? '')} ({String((meta.cost as Record<string, unknown>).basis ?? 'unknown')})
        </div>
      )}
      {item.error && <div className="mt-1 rounded bg-red-50 p-1.5 text-[11px] text-red-700">{item.error}</div>}
      <Payload label="Input" value={item.input} />
      <Payload label="Output" value={item.output} />
    </div>
  )
}

function TreeNode({ node }: { node: ExecutionNode }) {
  return (
    <li>
      <EventRow item={node.item} />
      {node.children.length > 0 && (
        <ul className="ml-4 mt-1.5 space-y-1.5 border-l border-ink-200 pl-3">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function AdminTraceDetail({ detail }: { detail: Detail }) {
  const { trace } = detail

  const graphEvents = useMemo(() => {
    if (detail.reconstructed || detail.events.length === 0) {
      return toFallbackGraphEvents(detail.fallback.agentEvents)
    }
    return toGraphEvents(detail.events)
  }, [detail])

  const tree = useMemo(() => buildExecutionTree(detail.events), [detail.events])
  const timeline = useMemo(() => detail.events.map(toTimelineItem), [detail.events])
  const attempts = useMemo(() => summarizeByAttempt(detail.events), [detail.events])

  const hasUnknownUsage = useMemo(
    () => detail.events.some((e) => e.event_type === 'model' && ((e.metadata as Record<string, unknown> | null)?.usageStatus === 'unknown' || (e.status === 'failed' && e.llm_total_tokens === 0))),
    [detail.events],
  )

  const totals = {
    llmInput: trace.llm_input_tokens,
    llmOutput: trace.llm_output_tokens,
    llmTotal: trace.llm_total_tokens,
    modelCalls: trace.model_call_count,
    toolCalls: trace.tool_call_count,
    agentCount: trace.agent_count,
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center gap-2 text-sm text-ink-500">
        <Link href="/admin" className="font-semibold text-primary-700 hover:text-primary-900">← Traces</Link>
        <span>/</span>
        <span className="font-mono text-xs text-ink-500">{trace.id}</span>
      </div>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-ink-900">
            <StatusPill status={trace.status} />
            <span className="text-ink-500">{trace.route ?? 'trace'}</span>
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-700">{trace.request || '(no request recorded)'}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-ink-500">
            <span className="rounded bg-ink-100 px-1.5 py-0.5">started {formatDateTime(trace.started_at)}</span>
            <span className="rounded bg-ink-100 px-1.5 py-0.5">completed {formatDateTime(trace.completed_at)}</span>
            {trace.workspace_id && <span className="rounded bg-ink-100 px-1.5 py-0.5">workspace {trace.workspace_id.slice(0, 8)}</span>}
            {detail.reconstructed && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">reconstructed from task tables</span>
            )}
          </div>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="LLM input" value={totals.llmTotal === 0 && hasUnknownUsage ? 'unknown' : formatNumber(totals.llmInput)} />
        <Metric label="LLM output" value={totals.llmTotal === 0 && hasUnknownUsage ? 'unknown' : formatNumber(totals.llmOutput)} />
        <Metric
          label="LLM total"
          value={totals.llmTotal === 0 && hasUnknownUsage ? 'unknown' : formatNumber(totals.llmTotal)}
          hint={`${formatNumber(totals.modelCalls)} model call(s)${hasUnknownUsage ? ' · includes unknown' : ''}`}
        />
        <Metric label="Tool calls" value={formatNumber(totals.toolCalls)} />
        <Metric label="Agents" value={formatNumber(totals.agentCount)} />
        <Metric label="Duration" value={formatDuration(trace.started_at && trace.completed_at ? Date.parse(trace.completed_at) - Date.parse(trace.started_at) : null)} />
      </section>

      {attempts.length > 1 && (
        <section className="mt-4 overflow-hidden rounded-xl border border-ink-200 bg-white">
          <div className="border-b border-ink-100 bg-ink-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Per-attempt breakdown</div>
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-ink-400">
              <tr>
                <th className="px-3 py-1.5">Attempt</th>
                <th className="px-3 py-1.5 text-right">Model calls</th>
                <th className="px-3 py-1.5 text-right">Input</th>
                <th className="px-3 py-1.5 text-right">Output</th>
                <th className="px-3 py-1.5 text-right">Total tokens</th>
                <th className="px-3 py-1.5 text-right">Tools</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.attempt} className="border-t border-ink-100">
                  <td className="px-3 py-1.5 font-medium text-ink-700">#{attempt.attempt}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{attempt.modelCalls}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(attempt.inputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(attempt.outputTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(attempt.totalTokens)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{attempt.toolCalls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Execution tree</h2>
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white p-3">
          {tree.length > 0 ? (
            <ul className="space-y-1.5">
              {tree.map((node) => (
                <TreeNode key={node.id} node={node} />
              ))}
            </ul>
          ) : graphEvents.length > 0 ? (
            <ol className="space-y-1.5">
              {graphEvents.map((event, index) => (
                <li key={String(event.id ?? `${String(event.instance_id ?? '')}:${String(event.seq ?? index)}`)} className="rounded-lg border border-ink-200 bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-ink-800">{String(event.public_message ?? event.agent_id ?? '')}</span>
                    <StatusPill status={String(event.status ?? '')} />
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-ink-400">{String(event.agent_role ?? event.event_type ?? '')}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-ink-500">No execution events recorded.</div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-500">Timeline</h2>
        <ol className="space-y-2">
          {timeline.length === 0 && <li className="rounded-lg border border-ink-200 bg-white p-3 text-sm text-ink-500">No events captured for this trace.</li>}
          {timeline.map((item) => (
            <li key={item.id} className="rounded-xl border border-ink-200 bg-white p-3">
              <EventRow item={item} />
            </li>
          ))}
        </ol>
      </section>

      {detail.fallback.agentEvents.length > 0 && (
        <p className="mt-4 text-[11px] text-ink-400">
          Showing {detail.fallback.agentEvents.length} reconstructed event(s) from durable task tables.
        </p>
      )}
      {trace.final_reply && (
        <section className="mt-6 rounded-xl border border-ink-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Final reply</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{trace.final_reply}</p>
        </section>
      )}
    </div>
  )
}

function safeStringify(value: unknown): string {
  if (isRecord(value) || Array.isArray(value)) {
    try {
      return JSON.stringify(value, null, 2).slice(0, 4000)
    } catch {
      return String(value)
    }
  }
  return String(value).slice(0, 4000)
}