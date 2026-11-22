import type { AgentNodeState, UsageRecord } from '../contracts'
import { emptyUsage } from '../contracts'

export type CanvasNodeKind = 'user' | 'orchestrator' | 'director' | 'subagent' | 'tool' | 'skill' | 'auditor' | 'synthesis'

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
  /** The central entry node (Orchestrator when present, else the Director). */
  entryId: string | null
  order: string[]
}

const ICONS: Readonly<Record<CanvasNodeKind, string>> = Object.freeze({
  user: 'user',
  orchestrator: 'sparkles',
  director: 'sparkles',
  subagent: 'bot',
  tool: 'wrench',
  skill: 'book',
  auditor: 'shield',
  synthesis: 'file',
})

const COLORS: Readonly<Record<CanvasNodeKind, string>> = Object.freeze({
  user: '#64748b',
  orchestrator: '#2563eb',
  director: '#7c3aed',
  subagent: '#0891b2',
  tool: '#f59e0b',
  skill: '#10b981',
  auditor: '#ef4444',
  synthesis: '#8b5cf6',
})

function roleKind(agentRole: string | null | undefined, agentId: string, eventType: string): CanvasNodeKind {
  if (agentId === 'orchestrator' || agentId === 'top_level_orchestrator' || agentRole === 'orchestrator') return 'orchestrator'
  if (agentRole === 'director' || agentId === 'research_director') return 'director'
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

function isInternalPlumbing(agentId?: string | null, label?: string | null): boolean {
  const normAgent = (agentId || '').toLowerCase().trim()
  const normLabel = (label || '').toLowerCase().trim()
  if (normAgent === 'orchestrator' || normAgent === 'top_level_orchestrator') {
    if (
      !normLabel ||
      normLabel.includes('load confirmed') ||
      normLabel.includes('business context') ||
      normLabel.includes('route the request') ||
      normLabel.includes('answer the request') ||
      normLabel.startsWith('route ')
    ) {
      return true
    }
  }
  return false
}

function displayLabel(kind: CanvasNodeKind, agentId: string, rawLabel: string): string {
  if (agentId === 'orchestrator') return 'Orchestrator'
  if (agentId === 'brain') return 'Brain'
  if (agentId === 'director' && kind === 'director') return 'Director'
  if (kind === 'tool') return 'Scrape'
  if (kind === 'skill') return 'Skill'
  return rawLabel
}

/** Build the graph only from persisted events and steps. No event is invented. */
export function buildAgentGraph(input: { events: PersistedEvent[]; steps?: PersistedStep[]; running?: boolean; userMessage?: string | null }): CanvasGraph {
  const nodes = new Map<string, CanvasNode>()
  const edges: CanvasEdge[] = []
  const order: string[] = []
  const pendingFlowEdges: { seq: number; from: string; to: string; message: string }[] = []

  for (const step of input.steps ?? []) {
    if (nodes.has(step.id)) continue
    if (isInternalPlumbing(step.agent, step.label)) continue
    const kind = roleKind(null, step.agent, 'step')
    const label = displayLabel(kind, step.agent, step.label)
    nodes.set(step.id, {
      id: step.id,
      instanceId: step.id,
      kind,
      agentId: step.agent,
      label,
      objective: label,
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
      if (from && to) pendingFlowEdges.push({ seq: event.seq, from, to, message: String(event.payload?.label ?? event.public_message ?? '') })
      continue
    }
    const rawLabel = String(event.payload?.task_summary ?? event.agent_id)
    if (isInternalPlumbing(event.agent_id, rawLabel)) continue
    const id = event.instance_id ?? `${event.agent_id}:${event.seq}`
    const kind = roleKind(event.agent_role ?? null, event.agent_id, event.event_type)
    const existing = nodes.get(id)
    const state = stateFromEvent(event.event_type, event.status)
    const label = existing?.label || displayLabel(kind, event.agent_id, rawLabel)
    const node: CanvasNode = existing ? {
      ...existing,
      state,
      label,
      objective: label,
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
      label,
      objective: label,
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
    if (from && from !== id && nodes.has(from)) {
      const kindOfEdge: CanvasEdge['kind'] = event.event_type === 'delegation' ? 'delegation' : event.event_type === 'skill_read' ? 'skill_read' : event.event_type === 'tool_call' ? 'tool_call' : 'flow'
      edges.push({ id: `edge:${event.seq}:${from}:${id}`, from, to: id, kind: kindOfEdge, message: event.public_message ?? '', animated: kindOfEdge === 'delegation' })
    }
  }

  for (const pf of pendingFlowEdges) {
    if (nodes.has(pf.from) && nodes.has(pf.to)) {
      edges.push({ id: `edge:${pf.seq}:${pf.from}:${pf.to}`, from: pf.from, to: pf.to, kind: 'flow', message: pf.message, animated: false })
    }
  }

  const userMessage = (input.userMessage ?? '').trim()
  if (userMessage) {
    const orchestrator = [...nodes.values()].find(node => node.kind === 'orchestrator')
    if (orchestrator && !nodes.has('user')) {
      nodes.set('user', {
        id: 'user', instanceId: null, kind: 'user', agentId: 'user', label: 'You', objective: 'You',
        state: 'completed', icon: ICONS.user, color: COLORS.user, sources: 0, consumption: emptyUsage(),
        startedAt: null, endedAt: null, failureReason: null, parametersRedacted: {}, messages: [userMessage], order: -1,
      })
      edges.push({ id: 'edge:user:orchestrator', from: 'user', to: orchestrator.id, kind: 'flow', message: '', animated: false })
    }
  }

  // Connect the Director handoff to the executor's root nodes so the task path
  // reads Orchestrator -> Director -> work. Only the explicit handoff node
  // (agentId "director") drives this; pure research graphs are unaffected.
  const handoff = [...nodes.values()].find(node => node.kind === 'director' && node.agentId === 'director')
  if (handoff) {
    const targets = new Set(edges.map(edge => edge.to))
    for (const node of nodes.values()) {
      if (node.id === handoff.id || node.kind === 'orchestrator' || node.kind === 'user') continue
      if (targets.has(node.id)) continue
      edges.push({ id: `edge:handoff:${node.id}`, from: handoff.id, to: node.id, kind: 'delegation', message: '', animated: false })
      targets.add(node.id)
    }
  }

  const list = [...nodes.values()].sort((a, b) => a.order - b.order)
  const orchestrator = list.find(node => node.kind === 'orchestrator') ?? null
  const director = list.find(node => node.kind === 'director') ?? null
  return { nodes: list, edges, directorId: director?.id ?? null, entryId: orchestrator?.id ?? director?.id ?? null, order }
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