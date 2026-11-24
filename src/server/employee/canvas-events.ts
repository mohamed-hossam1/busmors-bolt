import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanvasAgentEvent } from '../../features/agents/canvas'

/**
 * Project a trace's ACTUAL execution events into the customer-safe Canvas shape
 * (spec §10, §13.5). Reads only admin_trace_events for the given trace via the
 * service-role client, and emits agent/skill/tool nodes with names only — never
 * privileged payloads, prompts, or another workspace's data. The customer Canvas
 * must never read privileged admin payloads directly.
 */
export async function loadCanvasEvents(admin: SupabaseClient, traceId: string): Promise<CanvasAgentEvent[]> {
  const { data, error } = await admin
    .from('admin_trace_events')
    .select('id, event_type, agent_id, agent_role, instance_id, parent_event_id, status, tool_name, metadata')
    .eq('trace_id', traceId)
    .order('seq', { ascending: true })
  if (error || !data) return []

  const events: CanvasAgentEvent[] = []
  for (const row of data) {
    const eventType = String(row.event_type ?? '')
    const instanceId = (row.instance_id as string | null) ?? (row.id as string)
    const parentInstanceId = (row.parent_event_id as string | null) ?? null
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    if (eventType === 'agent') {
      events.push({
        instanceId,
        parentInstanceId,
        agentId: String(row.agent_id ?? 'agent'),
        role: String(row.agent_role ?? 'agent'),
        status: String(row.status ?? ''),
        label: typeof meta.label === 'string' ? meta.label : undefined,
        type: row.status === 'failed' ? 'agent_error' : row.status === 'running' ? 'agent_started' : 'agent_completed',
      })
    } else if (eventType === 'skill') {
      events.push({ instanceId, parentInstanceId, agentId: String(row.agent_id ?? 'skill'), role: 'skill', status: String(row.status ?? ''), type: 'skill_read', skillId: typeof meta.skillId === 'string' ? meta.skillId : String(row.agent_id ?? '') })
    } else if (eventType === 'tool') {
      events.push({ instanceId, parentInstanceId, agentId: String(row.agent_id ?? 'tool'), role: 'tool', status: String(row.status ?? ''), type: 'tool_call', toolName: String(row.tool_name ?? row.agent_id ?? '') })
    }
  }
  return events
}