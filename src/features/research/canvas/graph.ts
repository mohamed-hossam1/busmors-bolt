import type { AgentNodeState, UsageRecord } from '../contracts'
import { emptyUsage } from '../contracts'

export type CanvasNodeKind = 'user' | 'director' | 'subagent' | 'tool' | 'skill' | 'auditor' | 'synthesis'

export interface PersistedEvent {
  id?: string
  instance_id?: string | null
  correlation_id?: string | null
  parent_instance_id?: string | null
  seq: number
  event_type: string
  agent_id: string
  agent_role?: string | null
  status?: string | null
  public_message?: string | null
  redacted_parameters?: Record<string, unknown> | null
  source_ids?: unknown
  consumption?: { calls?: number; pages?: number; tokens?: number; credits?: number } | null
  started_at?: string | null
  ended_at?: string | null
  failure_reason?: string | null
  created_at?: string | null
  payload?: Record<string, unknown> | null
}

export interface PersistedStep {
  id: string
  agent: string
  label: string
  status: string
  output?: Record<string, unknown> | null
  started_at?: string | null
  completed_at?: string | null
}

export interface CanvasNode {
  id: string
  instanceId: string | null
  kind: CanvasNodeKind
  agentId: string
  label: string
  objective: string
  state: AgentNodeState
  icon: string
  color: string
  sources: number
  consumption: UsageRecord
  startedAt: string | null
  endedAt: string | null
  failureReason: string | null
  parametersRedacted: Record<string, unknown>
  messages: string[]
  order: number
}

export interface CanvasEdge {
  id: string
  from: string
  to: string
  kind: 'delegation' | 'tool_call' | 'skill_read' | 'flow'
  message: string
  animated: boolean
}

export interface CanvasGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  directorId: string | null
  order: string[]
}

const ICONS: Readonly<Record<CanvasNodeKind, string>> = Object.freeze({
  user: 'user',
  director: 'sparkles',
  subagent: 'bot',
  tool: 'wrench',
  skill: 'book',
  auditor: 'shield',
  synthesis: 'file',
})

const COLORS: Readonly<Record<CanvasNodeKind, string>> = Object.freeze({
  user: '#2563eb',
  director: '#7c3aed',
  subagent: '#0891b2',
  tool: '#f59e0b',
  skill: '#10b981',
  auditor: '#ef4444',
  synthesis: '#8b5cf6',
})

function roleKind(agentRole: string | null | undefined, agentId: string, eventType: string): CanvasNodeKind {
  if (agentRole === 'director' || agentId === 'research_director' || agentId === 'top_level_orchestrator') return 'director'
  if (agentRole === 'auditor') return 'auditor'
  if (agentRole === 'synthesis') return 'synthesis'
  if (agentRole === 'tool' || eventType === 'tool_call') return 'tool'
  if (agentRole === 'skill' || eventType === 'skill_read') return 'skill'
  return 'subagent'
}

function stateFromEvent(eventType: string, status: string | null | undefined): AgentNodeState {
  if (status === 'failed' || eventType === 'agent_error') return 'failed'
  if (status === 'partial') return 'partial'
  if (eventType === 'agent_completed') return 'completed'
  if (status === 'queued') return 'queued'
  return 'running'
}

function numberFrom(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

/** Build the graph only from persisted events and steps. No event is invented. */
export function buildAgentGraph(input: { events: PersistedEvent[]; steps?: PersistedStep[]; running?: boolean }): CanvasGraph {
  const nodes = new Map<string, CanvasNode>()
  const edges: CanvasEdge[] = []
  const order: string[] = []

  for (const step of input.steps ?? []) {
    if (nodes.has(step.id)) continue
    const kind = roleKind(null, step.agent, 'step')
    nodes.set(step.id, {
      id: step.id,
      instanceId: step.id,
      kind,
      agentId: step.agent,
      label: step.label,
      objective: step.label,
      state: step.status === 'failed' ? 'failed' : step.status === 'running' ? 'running' : 'completed',
      icon: ICONS[kind],
      color: COLORS[kind],
      sources: 0,
      consumption: emptyUsage(),
      startedAt: step.started_at ?? null,
      endedAt: step.completed_at ?? null,
      failureReason: null,
      parametersRedacted: {},
      messages: [],
      order: order.length,
    })
    order.push(step.id)
  }

  for (const event of input.events) {
    if (event.event_type === 'flow_connection') {
      const from = String(event.payload?.from ?? event.payload?.source ?? '')
      const to = String(event.payload?.to ?? event.payload?.target ?? '')
      if (from && to) edges.push({ id: `edge:${event.seq}:${from}:${to}`, from, to, kind: 'flow', message: String(event.payload?.label ?? event.public_message ?? ''), animated: false })
      continue
    }
    const id = event.instance_id ?? `${event.agent_id}:${event.seq}`
    const kind = roleKind(event.agent_role ?? null, event.agent_id, event.event_type)
    const existing = nodes.get(id)
    const state = stateFromEvent(event.event_type, event.status)
    const node: CanvasNode = existing ? {
      ...existing,
      state,
      label: existing.label || String(event.payload?.task_summary ?? event.agent_id),
      objective: String(event.payload?.task_summary ?? existing.objective ?? existing.label),
      sources: existing.sources + numberFrom(event.source_ids ?? event.payload?.source_ids),
      consumption: addConsumption(existing.consumption, event.consumption),
      startedAt: existing.startedAt ?? event.started_at ?? event.created_at ?? null,
      endedAt: event.ended_at ?? existing.endedAt ?? (event.event_type === 'agent_completed' ? event.created_at ?? null : null),
      failureReason: event.failure_reason ?? existing.failureReason,
      parametersRedacted: (event.redacted_parameters ?? event.payload?.redacted_parameters ?? existing.parametersRedacted) as Record<string, unknown>,
      messages: event.public_message ? [...existing.messages, event.public_message].slice(-8) : existing.messages,
    } : {
      id,
      instanceId: event.instance_id ?? null,
      kind,
      agentId: event.agent_id,
      label: String(event.payload?.task_summary ?? event.agent_id),
      objective: String(event.payload?.task_summary ?? event.agent_id),
      state,
      icon: ICONS[kind],
      color: COLORS[kind],
      sources: numberFrom(event.source_ids ?? event.payload?.source_ids),
      consumption: normalizeConsumption(event.consumption),
      startedAt: event.started_at ?? event.created_at ?? null,
      endedAt: event.ended_at ?? null,
      failureReason: event.failure_reason ?? null,
      parametersRedacted: (event.redacted_parameters ?? event.payload?.redacted_parameters ?? {}) as Record<string, unknown>,
      messages: event.public_message ? [event.public_message] : [],
      order: order.length,
    }
    if (!existing) order.push(id)
    nodes.set(id, node)

    const parent = event.parent_instance_id ?? (typeof event.payload?.parent_instance_id === 'string' ? event.payload.parent_instance_id : undefined)
    const from = typeof parent === 'string' ? parent : undefined
    if (from && from !== id) {
      const kindOfEdge: CanvasEdge['kind'] = event.event_type === 'delegation' ? 'delegation' : event.event_type === 'skill_read' ? 'skill_read' : event.event_type === 'tool_call' ? 'tool_call' : 'flow'
      edges.push({ id: `edge:${event.seq}:${from}:${id}`, from, to: id, kind: kindOfEdge, message: event.public_message ?? '', animated: kindOfEdge === 'delegation' })
    }
  }

  const list = [...nodes.values()]
  const director = list.find(node => node.kind === 'director') ?? null
  return { nodes: list, edges, directorId: director?.id ?? null, order }
}

function addConsumption(current: UsageRecord, addition: { calls?: number; pages?: number; tokens?: number; credits?: number } | null | undefined): UsageRecord {
  return {
    calls: current.calls + (addition?.calls ?? 0),
    pages: current.pages + (addition?.pages ?? 0),
    tokens: current.tokens + (addition?.tokens ?? 0),
    credits: current.credits + (addition?.credits ?? 0),
  }
}

function normalizeConsumption(value: { calls?: number; pages?: number; tokens?: number; credits?: number } | null | undefined): UsageRecord {
  return addConsumption(emptyUsage(), value)
}

/** The same persisted rows always rebuild the same sequence. */
export function graphFingerprint(graph: CanvasGraph): string {
  return graph.order.join('|') + '#' + graph.edges.map(edge => `${edge.from}>${edge.to}`).join(',')
}

export function nodeById(graph: CanvasGraph, id: string): CanvasNode | undefined {
  return graph.nodes.find(node => node.id === id)
}

export function failedNodes(graph: CanvasGraph): CanvasNode[] {
  return graph.nodes.filter(node => node.state === 'failed' || node.state === 'partial')
}