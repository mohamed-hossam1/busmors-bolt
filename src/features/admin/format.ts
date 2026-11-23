import type { AdminTraceEventRow, AdminTraceDetail } from './types'

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0'
  return new Intl.NumberFormat('en').format(value)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

export interface TimelineItem {
  id: string
  kind: 'model' | 'tool' | 'agent'
  label: string
  detail: string
  status: string
  startedAt: string | null
  endedAt: string | null
  durationMs: number | null
  tokens?: { input: number; output: number; total: number; cached: number; reasoning: number }
  provider?: string | null
  model?: string | null
  attempt?: number | null
  error?: string | null
  output?: unknown
}

export function eventLabel(event: AdminTraceEventRow): string {
  const meta = (event.metadata ?? {}) as Record<string, unknown>
  if (event.event_type === 'model') return event.operation ?? 'model'
  if (event.event_type === 'tool') return event.tool_name ?? event.agent_id ?? 'tool'
  return (typeof meta.label === 'string' && meta.label) || event.agent_id || 'agent'
}

export function toTimelineItem(event: AdminTraceEventRow): TimelineItem {
  const base: TimelineItem = {
    id: event.id,
    kind: event.event_type === 'model' ? 'model' : event.event_type === 'tool' ? 'tool' : 'agent',
    label: eventLabel(event),
    detail:
      event.event_type === 'model'
        ? [event.provider, event.model].filter(Boolean).join(' · ')
        : event.event_type === 'tool'
          ? [event.provider, event.operation].filter(Boolean).join(' · ')
          : event.agent_role ?? '',
    status: event.status ?? '',
    startedAt: event.started_at,
    endedAt: event.ended_at,
    durationMs: event.duration_ms,
    attempt: event.attempt,
    error: event.error,
  }
  if (event.event_type === 'model') {
    base.tokens = {
      input: event.llm_input_tokens,
      output: event.llm_output_tokens,
      total: event.llm_total_tokens,
      cached: event.cached_tokens,
      reasoning: event.reasoning_tokens,
    }
    base.provider = event.provider
    base.model = event.model
    base.output = event.output_preview
  } else if (event.event_type === 'tool') {
    base.provider = event.provider
    base.output = event.output_preview
    if (event.output_truncated) base.detail = `${base.detail} (truncated)`
  } else {
    base.output = event.input_payload
  }
  return base
}

export interface AttemptSummary {
  attempt: number
  modelCalls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  toolCalls: number
}

export function summarizeByAttempt(events: AdminTraceEventRow[]): AttemptSummary[] {
  const map = new Map<number, AttemptSummary>()
  for (const event of events) {
    const attempt = event.attempt ?? 0
    const row = map.get(attempt) ?? { attempt, modelCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, toolCalls: 0 }
    if (event.event_type === 'model') {
      row.modelCalls += 1
      row.inputTokens += event.llm_input_tokens
      row.outputTokens += event.llm_output_tokens
      row.totalTokens += event.llm_total_tokens
    } else if (event.event_type === 'tool') {
      row.toolCalls += 1
    }
    map.set(attempt, row)
  }
  return [...map.values()].sort((a, b) => a.attempt - b.attempt)
}

type GraphEvent = Record<string, unknown>

const GRAPH_TYPES = new Set(['agent_started', 'agent_completed', 'agent_error', 'tool_call', 'delegation', 'skill_read', 'flow_connection'])

/** Map admin events to the persisted-event shape buildAgentGraph consumes. */
export function toGraphEvents(events: AdminTraceEventRow[]): GraphEvent[] {
  const mapped: GraphEvent[] = []
  for (const event of events) {
    const type = GRAPH_TYPES.has(event.event_type) ? event.event_type : null
    if (!type) continue
    const label = eventLabel(event)
    const redacted =
      event.event_type === 'tool'
        ? { ...(isRecord(event.input_payload) ? event.input_payload : {}), output_preview: event.output_preview }
        : isRecord(event.input_payload)
          ? event.input_payload
          : {}
    mapped.push({
      id: event.id,
      task_id: '',
      instance_id: event.instance_id,
      parent_instance_id: event.parent_event_id,
      correlation_id: event.correlation_id,
      seq: event.seq,
      event_type: type,
      agent_id: event.agent_id ?? 'agent',
      agent_role: event.agent_role,
      status: event.status,
      public_message: label,
      redacted_parameters: redacted,
      source_ids: [],
      started_at: event.started_at,
      ended_at: event.ended_at,
      failure_reason: event.error,
      created_at: event.created_at,
      payload: { task_summary: label, label, agent_role: event.agent_role, status: event.status },
    })
  }
  return mapped
}

/** Map durable agent_events (fallback reconstruction) to the graph shape. */
export function toFallbackGraphEvents(rows: Record<string, unknown>[]): GraphEvent[] {
  return rows
    .filter((row) => GRAPH_TYPES.has(String(row.event_type ?? '')))
    .map((row) => {
      const payload = isRecord(row.payload) ? row.payload : {}
      return {
        id: String(row.id ?? ''),
        task_id: String(row.task_id ?? ''),
        instance_id: (row.instance_id as string | undefined) ?? undefined,
        parent_instance_id: (row.parent_instance_id as string | null | undefined) ?? null,
        seq: Number(row.seq ?? 0),
        event_type: String(row.event_type),
        agent_id: String(row.agent_id ?? 'agent'),
        agent_role: (row.agent_role as string | null | undefined) ?? null,
        status: (payload.status as string | undefined) ?? null,
        public_message: (payload.public_message as string | undefined) ?? (payload.label as string | undefined) ?? '',
        redacted_parameters: (row.redacted_parameters as Record<string, unknown> | undefined) ?? {},
        source_ids: (row.source_ids as unknown) ?? [],
        consumption: (row.consumption as Record<string, unknown> | undefined) ?? null,
        started_at: (row.started_at as string | null | undefined) ?? (row.created_at as string | undefined) ?? null,
        ended_at: (row.ended_at as string | null | undefined) ?? null,
        failure_reason: (row.failure_reason as string | null | undefined) ?? null,
        created_at: String(row.created_at ?? ''),
        payload,
      }
    })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function traceTotals(detail: AdminTraceDetail) {
  return {
    llmInput: detail.trace.llm_input_tokens,
    llmOutput: detail.trace.llm_output_tokens,
    llmTotal: detail.trace.llm_total_tokens,
    modelCalls: detail.trace.model_call_count,
    toolCalls: detail.trace.tool_call_count,
    agentCount: detail.trace.agent_count,
  }
}