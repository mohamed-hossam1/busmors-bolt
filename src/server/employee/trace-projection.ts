import type { CanvasEvent } from '../../components/chat/agentCanvasGraph'

/**
 * Pure projection from execution trace events to Canvas events (Phase 7 Part B).
 *
 * Deterministic and side-effect free (no `server-only`, no I/O) so it can be
 * unit-tested and reused by both the live chat response and the trace endpoint.
 * The Canvas only ever sees agent states, used tools and loaded skills — model
 * and other internal-step events are dropped, and no raw payloads are exposed.
 */

/** Minimal structural shape shared by buffered and persisted trace events. */
export interface TraceEventLike {
  id: string
  seq: number
  event_type: string
  agent_id?: string | null
  agent_role?: string | null
  parent_agent_id?: string | null
  instance_id?: string | null
  tool_name?: string | null
  status?: string | null
  started_at?: string | null
  ended_at?: string | null
  error?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

function labelFromMetadata(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const label = (metadata as Record<string, unknown>).label
    if (typeof label === 'string' && label.trim()) return label.trim()
  }
  return null
}

export function projectTraceEvents(events: ReadonlyArray<TraceEventLike>): CanvasEvent[] {
  const projected: CanvasEvent[] = []
  for (const event of events) {
    const base = {
      id: event.id,
      seq: event.seq,
      created_at: event.created_at ?? null,
      started_at: event.started_at ?? null,
      ended_at: event.ended_at ?? null,
    }

    if (event.event_type === 'agent') {
      const label = labelFromMetadata(event.metadata) ?? event.agent_role ?? event.agent_id ?? 'agent'
      projected.push({
        ...base,
        event_type: 'agent',
        agent_id: event.agent_id ?? 'agent',
        agent_role: event.agent_role ?? null,
        instance_id: event.instance_id ?? event.agent_id ?? null,
        parent_instance_id: event.parent_agent_id ?? null,
        status: event.status ?? null,
        public_message: label,
        failure_reason: event.error ?? null,
        payload: { label },
      })
      continue
    }

    if (event.event_type === 'tool') {
      const name = event.tool_name ?? event.agent_id ?? 'tool'
      projected.push({
        ...base,
        event_type: 'tool_call',
        agent_id: name,
        agent_role: 'tool',
        instance_id: event.id,
        parent_instance_id: event.instance_id ?? null,
        status: event.status ?? null,
        payload: { label: name },
      })
      continue
    }

    if (event.event_type === 'skill') {
      const name = event.agent_id ?? 'skill'
      projected.push({
        ...base,
        event_type: 'skill_read',
        agent_id: name,
        agent_role: 'skill',
        instance_id: event.id,
        parent_instance_id: event.instance_id ?? null,
        status: event.status ?? null,
        payload: { label: name },
      })
      continue
    }

    // model and any other event types are intentionally dropped: the Canvas
    // never renders model/internal-step nodes.
  }
  return projected
}