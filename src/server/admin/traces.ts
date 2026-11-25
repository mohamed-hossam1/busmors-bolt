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
import { normalizeTraceFilters, normalizeTraceRow } from '../../features/admin/traceQuery'

export type {
  AdminTraceDetail,
  AdminTraceEventRow,
  AdminTraceListItem,
  AdminTraceListFilters,
  AdminTraceListResult,
}

export async function listTraces(filters: AdminTraceListFilters): Promise<AdminTraceListResult> {
  const admin = createAdminClient()
  const { page, pageSize, from, to, q, status, route, workspaceId, userId, startedFrom, startedTo } =
    normalizeTraceFilters(filters)

  let query = admin.from('admin_trace_list').select('*', { count: 'exact' })
  if (status) query = query.eq('status', status)
  if (route) query = query.eq('route', route)
  if (workspaceId) query = query.eq('workspace_id', workspaceId)
  if (userId) query = query.eq('user_id', userId)
  if (startedFrom) query = query.gte('started_at', startedFrom)
  if (startedTo) query = query.lte('started_at', startedTo)
  if (q) query = query.or(`request.ilike.%${q}%,final_reply.ilike.%${q}%`)

  const { data, error, count } = await query
    .order('started_at', { ascending: false, nullsFirst: false })
    .range(from, to)
  if (error) throw error
  return {
    data: (data ?? []).map((row) => normalizeTraceRow(row as Record<string, unknown>)),
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

  return {
    trace: normalizeTraceRow(traceRow as Record<string, unknown>),
    events: (eventRows ?? []) as unknown as AdminTraceEventRow[],
    reconstructed: false,
  }
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