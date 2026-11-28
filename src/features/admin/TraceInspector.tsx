'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronRight,
  Cpu,
  Sparkles,
  BookOpen,
  Wrench,
  CircleDot,
} from 'lucide-react'
import type { AdminTraceDetail, AdminTraceEventRow } from './types'
import { buildTraceTree, type TraceNodeKind, type TraceTreeNode } from './traceTree'
import {
  formatDateTime,
  formatDuration,
  formatTokens,
  snippet,
  statusClasses,
  stringifyPayload,
  traceDurationMs,
} from './format'

const KIND_ICON: Record<TraceNodeKind, typeof Bot> = {
  agent: Bot,
  model: Cpu,
  tool: Wrench,
  skill: BookOpen,
  other: CircleDot,
}

const KIND_LABEL: Record<TraceNodeKind, string> = {
  agent: 'Agent',
  model: 'Model',
  tool: 'Tool',
  skill: 'Skill',
  other: 'Event',
}

export default function TraceInspector({ detail, backQuery }: { detail: AdminTraceDetail; backQuery?: string }) {
  const params = useParams<{ lang: string }>()
  const lang = params?.lang ?? 'en'
  const tree = useMemo(() => buildTraceTree(detail.events), [detail.events])
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const node of tree.byId.values()) {
      if (node.kind === 'agent' && node.children.length > 0) initial.add(node.event.id)
    }
    return initial
  })
  const [selectedId, setSelectedId] = useState<string | null>(tree.roots[0]?.event.id ?? null)

  const selected = selectedId ? tree.byId.get(selectedId)?.event ?? null : null
  const trace = detail.trace
  const duration = traceDurationMs(trace.started_at, trace.completed_at)

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-4 py-2 text-sm">
        <Link
          href={backQuery ? `/${lang}/admin/traces?${backQuery}` : `/${lang}/admin/traces`}
          className="flex items-center gap-1 text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft size={14} /> Traces
        </Link>
        <span className="text-ink-300">/</span>
        <span className="truncate font-mono text-xs text-ink-500">{trace.id}</span>
      </div>

      <div className="border-b border-ink-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(trace.status)}`}>
            {trace.status || '—'}
          </span>
          {trace.route && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-600">{trace.route}</span>
          )}
          {detail.reconstructed && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">reconstructed</span>
          )}
        </div>
        <p className="mt-2 text-sm text-ink-900">{snippet(trace.request, 240)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-600 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Duration" value={formatDuration(duration)} />
          <Stat label="Agents" value={String(trace.agent_count)} />
          <Stat label="Model calls" value={String(trace.model_call_count)} />
          <Stat label="Tool calls" value={String(trace.tool_call_count)} />
          <Stat label="Tokens" value={formatTokens(trace.llm_total_tokens)} />
          <Stat label="Started" value={formatDateTime(trace.started_at)} />
        </dl>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="sleek-scrollbar min-h-0 flex-1 overflow-auto border-b border-ink-200 p-3 lg:border-b-0 lg:border-e">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Execution Tree
          </h2>
          {tree.roots.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-ink-400">No events recorded for this trace.</p>
          ) : (
            <ul className="space-y-0.5">
              {tree.roots.map((node) => (
                <TreeBranch
                  key={node.event.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  selectedId={selectedId}
                  onToggle={toggle}
                  onSelect={setSelectedId}
                />
              ))}
            </ul>
          )}
        </div>

        <aside className="sleek-scrollbar min-h-0 w-full overflow-auto p-3 lg:w-[26rem] lg:shrink-0">
          {selected ? <EventInspector event={selected} /> : <EmptyInspector />}
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-400">{label}</dt>
      <dd className="font-medium text-ink-800">{value}</dd>
    </div>
  )
}

function TreeBranch({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: TraceTreeNode
  depth: number
  expanded: Set<string>
  selectedId: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  const Icon = KIND_ICON[node.kind]
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.event.id)
  const isSelected = selectedId === node.event.id
  const status = node.event.status

  return (
    <li>
      <div
        className={`flex items-center gap-1.5 rounded-lg px-1.5 py-1 ${
          isSelected ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-ink-50'
        }`}
        style={{ paddingInlineStart: `${depth * 16 + 6}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.event.id)}
          aria-label={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : undefined}
          className={`flex h-4 w-4 shrink-0 items-center justify-center ${
            hasChildren ? 'text-ink-500' : 'invisible'
          }`}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.event.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-start"
        >
          <Icon size={14} className="shrink-0 text-ink-400" />
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
            {KIND_LABEL[node.kind]}
          </span>
          <span className="truncate text-sm text-ink-800">{node.label}</span>
          {status && (
            <span className={`ms-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${statusClasses(status)}`}>
              {status}
            </span>
          )}
          {node.event.error && <AlertCircle size={12} className="shrink-0 text-red-500" />}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <ul>
          {node.children.map((child) => (
            <TreeBranch
              key={child.event.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function EmptyInspector() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-ink-400">
      <Sparkles size={20} />
      Select any node to inspect its input, output, and metadata.
    </div>
  )
}

function EventInspector({ event }: { event: AdminTraceEventRow }) {
  const input = stringifyPayload(event.input_payload)
  const output = stringifyPayload(event.output_preview)
  const skills = readLoadedSkills(event)

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-ink-900">{KIND_LABEL[traceKindOf(event)]} Inspector</h3>
        {event.status && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(event.status)}`}>
            {event.status}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Field label="Event type" value={event.event_type} />
        <Field label="Agent role" value={event.agent_role ?? '—'} />
        <Field label="Provider" value={event.provider ?? '—'} />
        <Field label="Model" value={event.model ?? '—'} />
        <Field label="Tool" value={event.tool_name ?? '—'} />
        <Field label="Operation" value={event.operation ?? '—'} />
        <Field label="Latency" value={formatDuration(event.duration_ms)} />
        <Field label="Stop reason" value={event.status ?? '—'} />
        <Field label="In tokens" value={formatTokens(event.llm_input_tokens)} />
        <Field label="Out tokens" value={formatTokens(event.llm_output_tokens)} />
        <Field label="Total tokens" value={formatTokens(event.llm_total_tokens)} />
        <Field label="Attempt" value={event.attempt != null ? String(event.attempt) : '—'} />
      </dl>

      {event.fallback_used && (
        <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">Fallback model used.</p>
      )}

      {event.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap break-words">{event.error}</span>
        </div>
      )}

      {skills.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Loaded skills</h4>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span key={skill} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      <PayloadBlock title="Input" body={input} />
      <PayloadBlock
        title={event.output_truncated ? 'Output (truncated)' : 'Output'}
        body={output}
        note={
          event.output_truncated && event.output_original_bytes != null
            ? `Original ${formatTokens(event.output_original_bytes)} bytes`
            : undefined
        }
      />

      {event.metadata && Object.keys(event.metadata).length > 0 && (
        <PayloadBlock title="Metadata" body={stringifyPayload(event.metadata)} />
      )}
    </div>
  )
}

function traceKindOf(event: AdminTraceEventRow) {
  const type = (event.event_type ?? '').toLowerCase()
  if (type.includes('model')) return 'model' as const
  if (type.includes('tool')) return 'tool' as const
  if (type.includes('skill')) return 'skill' as const
  return 'agent' as const
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-400">{label}</dt>
      <dd className="truncate font-medium text-ink-800" title={value}>
        {value}
      </dd>
    </div>
  )
}

function PayloadBlock({ title, body, note }: { title: string; body: string; note?: string }) {
  return (
    <div>
      <h4 className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-500">
        <span>{title}</span>
        {note && <span className="font-normal normal-case text-ink-400">{note}</span>}
      </h4>
      <pre className="sleek-scrollbar max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-900 p-2.5 text-[11px] leading-relaxed text-ink-100">
        {body || '—'}
      </pre>
    </div>
  )
}

function readLoadedSkills(event: AdminTraceEventRow): string[] {
  const skills = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) skills.add(value.trim())
  }
  add(event.agent_id)
  const metadata = event.metadata
  if (metadata && typeof metadata === 'object') {
    const loaded = (metadata as Record<string, unknown>).loaded_skills
    if (Array.isArray(loaded)) loaded.forEach(add)
    add((metadata as Record<string, unknown>).skill)
  }
  if (event.event_type.toLowerCase().includes('skill')) {
    return [...skills]
  }
  return []
}