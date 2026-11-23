import 'server-only'
import { createAdminClient } from '../supabase-admin'
import { MAX_BYTES, MAX_EVENTS, observabilityEnabled } from '../observability'
import type {
  AdminTraceDetail,
  AdminTraceEventRow,
  AdminTraceListItem,
  AdminTraceListFilters,
  AdminTraceListResult,
} from '../../features/admin/types'

export type {
  AdminTraceDetail,
  AdminTraceEventRow,
  AdminTraceListItem,
  AdminTraceListFilters,
  AdminTraceListResult,
}

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function normalizeRow(row: Record<string, unknown>): AdminTraceListItem {
  return {
    id: String(row.id),
    workspace_id: (row.workspace_id as string | null) ?? null,
    user_id: (row.user_id as string | null) ?? null,
    conversation_id: (row.conversation_id as string | null) ?? null,
    request: String(row.request ?? ''),
    route: (row.route as string | null) ?? null,
    status: String(row.status ?? ''),
    started_at: (row.started_at as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    final_reply: (row.final_reply as string | null) ?? null,
    has_admin_trace: Boolean(row.has_admin_trace),
    has_task: Boolean(row.has_task),
    task_id: (row.task_id as string | null) ?? null,
    llm_input_tokens: num(row.llm_input_tokens),
    llm_output_tokens: num(row.llm_output_tokens),
    llm_total_tokens: num(row.llm_total_tokens),
    model_call_count: num(row.model_call_count),
    tool_call_count: num(row.tool_call_count),
    agent_count: num(row.agent_count),
  }
}

/** Sanitize a free-text search term so it cannot break the PostgREST or-filter. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()%\\]/g, ' ').trim().slice(0, 120)
}

export async function listTraces(filters: AdminTraceListFilters): Promise<AdminTraceListResult> {
  const admin = createAdminClient()
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 20)))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = admin.from('admin_trace_list').select('*', { count: 'exact' })
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.route) query = query.eq('route', filters.route)
  if (filters.workspaceId) query = query.eq('workspace_id', filters.workspaceId)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.from) query = query.gte('started_at', filters.from)
  if (filters.to) query = query.lte('started_at', filters.to)
  const q = sanitizeSearch(filters.q ?? '')
  if (q) query = query.or(`request.ilike.%${q}%,final_reply.ilike.%${q}%`)

  const { data, error, count } = await query
    .order('started_at', { ascending: false, nullsFirst: false })
    .range(from, to)
  if (error) throw error
  return {
    data: (data ?? []).map((row) => normalizeRow(row as Record<string, unknown>)),
    page,
    pageSize,
    total: count ?? 0,
  }
}

export async function getTraceDetail(id: string): Promise<AdminTraceDetail | null> {
  const admin = createAdminClient()
  const { data: traceRow, error: traceError } = await admin
    .from('admin_trace_list')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (traceError) throw traceError
  if (!traceRow) return null

  const { data: eventRows, error: eventError } = await admin
    .from('admin_trace_events')
    .select('*')
    .eq('trace_id', id)
    .order('seq', { ascending: true })
  if (eventError) throw eventError

  const trace = normalizeRow(traceRow as Record<string, unknown>)
  const events = (eventRows ?? []) as unknown as AdminTraceEventRow[]

  const fallback: AdminTraceDetail['fallback'] = { agentEvents: [], steps: [], usage: [] }
  const reconstructed = trace.has_task && (!trace.has_admin_trace || events.length === 0)
  if (reconstructed && trace.task_id) {
    const [agentEvents, steps, usage] = await Promise.all([
      admin.from('agent_events').select('*').eq('task_id', trace.task_id).order('seq', { ascending: true }),
      admin.from('task_steps').select('*').eq('task_id', trace.task_id).order('position', { ascending: true }),
      admin.from('task_usage').select('*').eq('task_id', trace.task_id).order('created_at', { ascending: true }),
    ])
    fallback.agentEvents = (agentEvents.data ?? []) as Record<string, unknown>[]
    fallback.steps = (steps.data ?? []) as Record<string, unknown>[]
    fallback.usage = (usage.data ?? []) as Record<string, unknown>[]
  }

  return { trace, events, fallback, reconstructed }
}

export async function adminHealth() {
  return {
    enabled: observabilityEnabled(),
    caps: {
      maxEvents: MAX_EVENTS,
      maxBytes: MAX_BYTES,
    },
  }
}