import 'server-only'
import { createAdminClient } from '../supabase-admin'
import type { CanvasEvent } from '../../components/chat/agentCanvasGraph'
import { projectTraceEvents, type TraceEventLike } from './trace-projection'

/**
 * Customer-facing execution trace reader (Phase 7 Part B).
 *
 * The admin trace tables are service-role only and hold full, sanitized payloads.
 * The customer Canvas must never touch those payloads: this module reads them
 * with the service-role client, verifies the trace belongs to the caller's
 * workspace, and projects each event down to the minimal Canvas shape (agent
 * states, used tools, loaded skills). No model nodes, no raw inputs/outputs.
 */

export interface WorkspaceTrace {
  traceId: string
  events: CanvasEvent[]
}

export { projectTraceEvents, type TraceEventLike }

type AdminClient = ReturnType<typeof createAdminClient>

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveTraceId(
  admin: AdminClient,
  id: string,
  workspaceId: string,
): Promise<string | null> {
  if (!UUID_RE.test(id)) return null

  const { data: traceRow, error: traceError } = await admin
    .from('admin_traces')
    .select('id,workspace_id')
    .eq('id', id)
    .maybeSingle()
  if (traceError) throw traceError

  if (traceRow) {
    const row = traceRow as { id: string; workspace_id: string | null }
    // Ownership check: a trace from another workspace is treated as not found.
    if (row.workspace_id && row.workspace_id !== workspaceId) return null
    return row.id
  }

  // Not a trace id: treat it as a conversation id and load its latest trace,
  // scoped to the caller's workspace.
  const { data: byConversation, error: conversationError } = await admin
    .from('admin_traces')
    .select('id')
    .eq('conversation_id', id)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (conversationError) throw conversationError
  const rows = (byConversation ?? []) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

/**
 * Load the sanitized Canvas events for a trace id (or a conversation id, which
 * resolves to its latest trace). Returns null when the id is unknown or owned by
 * another workspace.
 */
export async function loadWorkspaceTrace(
  id: string,
  workspaceId: string,
): Promise<WorkspaceTrace | null> {
  const admin = createAdminClient()
  const traceId = await resolveTraceId(admin, id, workspaceId)
  if (!traceId) return null

  const { data: eventRows, error: eventError } = await admin
    .from('admin_trace_events')
    .select('*')
    .eq('trace_id', traceId)
    .order('seq', { ascending: true })
  if (eventError) throw eventError

  return {
    traceId,
    events: projectTraceEvents((eventRows ?? []) as unknown as TraceEventLike[]),
  }
}