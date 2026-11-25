import type {
  AdminTraceListItem,
  AdminTraceListFilters,
} from './types'

/**
 * Pure, client-safe helpers for the admin trace list: filter normalization and
 * row shaping. Kept free of `server-only` / Supabase imports so they can be
 * unit-tested directly and reused by both the server loader and the UI.
 */

function num(value: unknown): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Normalize a raw `admin_trace_list` row into the client-safe list item shape. */
export function normalizeTraceRow(row: Record<string, unknown>): AdminTraceListItem {
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
    has_admin_trace: Boolean(row.has_admin_trace ?? true),
    llm_input_tokens: num(row.llm_input_tokens),
    llm_output_tokens: num(row.llm_output_tokens),
    llm_total_tokens: num(row.llm_total_tokens),
    model_call_count: num(row.model_call_count),
    tool_call_count: num(row.tool_call_count),
    agent_count: num(row.agent_count),
  }
}

/** Sanitize a free-text search term so it cannot break the PostgREST or-filter. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%\\]/g, ' ').trim().slice(0, 120)
}

export interface NormalizedTraceFilters {
  page: number
  pageSize: number
  from: number
  to: number
  q: string
  status?: string
  route?: string
  workspaceId?: string
  userId?: string
  startedFrom?: string
  startedTo?: string
}

/** Pure normalization of raw list filters into bounded, sanitized values. */
export function normalizeTraceFilters(filters: AdminTraceListFilters): NormalizedTraceFilters {
  const page = Math.max(1, Math.trunc(filters.page ?? 1))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 20)))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return {
    page,
    pageSize,
    from,
    to,
    q: sanitizeSearch(filters.q ?? ''),
    status: filters.status?.trim() || undefined,
    route: filters.route?.trim() || undefined,
    workspaceId: filters.workspaceId?.trim() || undefined,
    userId: filters.userId?.trim() || undefined,
    startedFrom: filters.from || undefined,
    startedTo: filters.to || undefined,
  }
}