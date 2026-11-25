export type CanvasNodeKind =
  | 'user'
  | 'orchestrator'
  | 'director'
  | 'subagent'
  | 'tool'
  | 'skill'
  | 'auditor'
  | 'synthesis'

export type CanvasNodeState = 'queued' | 'running' | 'completed' | 'partial' | 'failed'

export interface CanvasUsage {
  calls: number
  pages: number
  tokens: number
  credits: number
}

export function emptyCanvasUsage(): CanvasUsage {
  return { calls: 0, pages: 0, tokens: 0, credits: 0 }
}

export interface CanvasEvent {
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

export interface CanvasStep {
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
  state: CanvasNodeState
  icon: string
  color: string
  sources: number
  consumption: CanvasUsage
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

function resolveNodeKind(
  agentRole: string | null | undefined,
  agentId: string,
  eventType: string,
): CanvasNodeKind {
  if (agentRole === 'orchestrator' || agentId === 'orchestrator') return 'orchestrator'
  if (agentRole === 'director') return 'director'
  if (agentRole === 'auditor') return 'auditor'
  if (agentRole === 'synthesis') return 'synthesis'
  if (agentRole === 'tool' || eventType === 'tool_call') return 'tool'
  if (agentRole === 'skill' || eventType === 'skill_read') return 'skill'
  if (agentRole === 'user' || agentId === 'user') return 'user'
  return 'subagent'
}

function resolveNodeState(eventType: string, status: string | null | undefined): CanvasNodeState {
  if (status === 'failed' || eventType === 'agent_error') return 'failed'
  if (status === 'partial') return 'partial'
  if (status === 'completed' || eventType === 'agent_completed') return 'completed'
  if (status === 'queued') return 'queued'
  return 'running'
}

function countFrom(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return 0
}

function normalizeUsage(
  addition: { calls?: number; pages?: number; tokens?: number; credits?: number } | null | undefined,
): CanvasUsage {
  return {
    calls: addition?.calls ?? 0,
    pages: addition?.pages ?? 0,
    tokens: addition?.tokens ?? 0,
    credits: addition?.credits ?? 0,
  }
}

function addUsage(current: CanvasUsage, addition: CanvasUsage | null | undefined): CanvasUsage {
  if (!addition) return current
  return {
    calls: current.calls + addition.calls,
    pages: current.pages + addition.pages,
    tokens: current.tokens + addition.tokens,
    credits: current.credits + addition.credits,
  }
}

function readLabel(event: CanvasEvent): string {
  const payloadLabel = event.payload?.label ?? event.payload?.task_summary
  if (typeof payloadLabel === 'string' && payloadLabel.trim()) return payloadLabel.trim()
  return event.agent_id
}

function readRole(event: CanvasEvent): string | null {
  if (typeof event.agent_role === 'string' && event.agent_role) return event.agent_role
  if (typeof event.payload?.agent_role === 'string' && event.payload.agent_role) {
    return event.payload.agent_role
  }
  return null
}

function readStatus(event: CanvasEvent): string | null {
  if (typeof event.status === 'string' && event.status) return event.status
  if (typeof event.payload?.status === 'string' && event.payload.status) return event.payload.status
  return null
}

/**
 * Build a generic execution graph purely from recorded events and optional steps.
 * Independent of any specific agent framework or orchestration topology.
 */
export function buildAgentGraph(input: {
  events: CanvasEvent[]
  steps?: CanvasStep[]
  running?: boolean
  userMessage?: string | null
  activeRootId?: string | null
}): CanvasGraph {
  const nodes = new Map<string, CanvasNode>()
  const edges: CanvasEdge[] = []
  const order: string[] = []
  const pendingFlowEdges: { seq: number; from: string; to: string; message: string }[] = []

  for (const step of input.steps ?? []) {
    if (nodes.has(step.id)) continue
    const kind = resolveNodeKind(null, step.agent, 'step')
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
      consumption: emptyCanvasUsage(),
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
      if (from && to) {
        pendingFlowEdges.push({
          seq: event.seq,
          from,
          to,
          message: String(event.payload?.label ?? event.public_message ?? ''),
        })
      }
      continue
    }

    const id = event.instance_id ?? `${event.agent_id}:${event.seq}`
    const role = readRole(event)
    const kind = resolveNodeKind(role, event.agent_id, event.event_type)
    const existing = nodes.get(id)
    const state = resolveNodeState(event.event_type, readStatus(event))
    const rawLabel = readLabel(event)
    const label = existing?.label || rawLabel
    const incomingUsage = normalizeUsage(event.consumption)

    const node: CanvasNode = existing
      ? {
          ...existing,
          state,
          label,
          objective: label,
          sources: existing.sources + countFrom(event.source_ids ?? event.payload?.source_ids),
          consumption: addUsage(existing.consumption, incomingUsage),
          startedAt: existing.startedAt ?? event.started_at ?? event.created_at ?? null,
          endedAt:
            event.ended_at ??
            existing.endedAt ??
            (event.event_type === 'agent_completed' ? (event.created_at ?? null) : null),
          failureReason: event.failure_reason ?? existing.failureReason,
          parametersRedacted: (event.redacted_parameters ??
            event.payload?.redacted_parameters ??
            existing.parametersRedacted) as Record<string, unknown>,
          messages: event.public_message
            ? [...existing.messages, event.public_message].slice(-8)
            : existing.messages,
        }
      : {
          id,
          instanceId: event.instance_id ?? null,
          kind,
          agentId: event.agent_id,
          label,
          objective: label,
          state,
          icon: ICONS[kind],
          color: COLORS[kind],
          sources: countFrom(event.source_ids ?? event.payload?.source_ids),
          consumption: incomingUsage,
          startedAt: event.started_at ?? event.created_at ?? null,
          endedAt: event.ended_at ?? null,
          failureReason: null,
          parametersRedacted: (event.redacted_parameters ??
            event.payload?.redacted_parameters ??
            {}) as Record<string, unknown>,
          messages: event.public_message ? [event.public_message] : [],
          order: order.length,
        }

    if (!existing) order.push(id)
    nodes.set(id, node)

    const parent =
      event.parent_instance_id ??
      (typeof event.payload?.parent_instance_id === 'string' ? event.payload.parent_instance_id : undefined)
    if (typeof parent === 'string' && parent !== id && nodes.has(parent)) {
      const edgeKind: CanvasEdge['kind'] =
        event.event_type === 'delegation'
          ? 'delegation'
          : event.event_type === 'skill_read'
            ? 'skill_read'
            : event.event_type === 'tool_call'
              ? 'tool_call'
              : 'flow'
      edges.push({
        id: `edge:${event.seq}:${parent}:${id}`,
        from: parent,
        to: id,
        kind: edgeKind,
        message: event.public_message ?? '',
        animated: edgeKind === 'delegation',
      })
    }
  }

  for (const pf of pendingFlowEdges) {
    if (nodes.has(pf.from) && nodes.has(pf.to)) {
      edges.push({
        id: `edge:${pf.seq}:${pf.from}:${pf.to}`,
        from: pf.from,
        to: pf.to,
        kind: 'flow',
        message: pf.message,
        animated: false,
      })
    }
  }

  const list = [...nodes.values()].sort((a, b) => a.order - b.order)
  const targetIds = new Set(edges.map((edge) => edge.to))
  const entryNode =
    (input.activeRootId ? nodes.get(input.activeRootId) : null) ??
    list.find((node) => node.kind !== 'user' && !targetIds.has(node.id)) ??
    list.find((node) => node.kind !== 'user') ??
    null

  const userMessage = (input.userMessage ?? '').trim()
  if (userMessage && entryNode && !nodes.has('user')) {
    const userNode: CanvasNode = {
      id: 'user',
      instanceId: null,
      kind: 'user',
      agentId: 'user',
      label: 'You',
      objective: 'You',
      state: 'completed',
      icon: ICONS.user,
      color: COLORS.user,
      sources: 0,
      consumption: emptyCanvasUsage(),
      startedAt: null,
      endedAt: null,
      failureReason: null,
      parametersRedacted: {},
      messages: [userMessage],
      order: -1,
    }
    nodes.set('user', userNode)
    list.unshift(userNode)
    edges.push({
      id: `edge:user:${entryNode.id}`,
      from: 'user',
      to: entryNode.id,
      kind: 'flow',
      message: '',
      animated: false,
    })
  }

  return {
    nodes: list,
    edges,
    entryId: entryNode?.id ?? null,
    order,
  }
}

/** Role → fixed top-down row. Lower is higher on the canvas. */
export const ROLE_DEPTH: Partial<Record<CanvasNodeKind, number>> = {
  user: 0,
  orchestrator: 1,
  director: 2,
}

export const ROLE_ORDER: Partial<Record<CanvasNodeKind, number>> = {
  user: 0,
  orchestrator: 1,
  director: 2,
  subagent: 3,
  auditor: 4,
  synthesis: 5,
}

/**
 * Strict, deterministic top-down layout.
 *
 * Every primary node is assigned a depth (row): User → Orchestrator → Director →
 * specialists, derived from the real parent→child edges but clamped to the fixed
 * role order so y strictly increases top-to-bottom. Nodes sharing a depth form a
 * horizontal row (specialists branch downward). Tool/Skill chips are not laid out
 * as graph nodes; they are attached to their parent's left/right side.
 */
export function buildTopDownLayout(
  primaryNodes: CanvasNode[],
  edges: CanvasEdge[],
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  if (primaryNodes.length === 0) return pos

  const TOP = 24
  const ROW_GAP = 170
  const COL_GAP = 260
  const CENTER = 380

  const ids = new Set(primaryNodes.map((node) => node.id))
  const parent = new Map<string, string>()
  for (const edge of edges) {
    if (edge.kind !== 'delegation' && edge.kind !== 'flow') continue
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue
    if (!parent.has(edge.to)) parent.set(edge.to, edge.from)
  }

  const byId = new Map(primaryNodes.map((node) => [node.id, node]))
  const depthMemo = new Map<string, number>()

  const depthOf = (node: CanvasNode, seen: Set<string>): number => {
    if (depthMemo.has(node.id)) return depthMemo.get(node.id)!
    const fixed = ROLE_DEPTH[node.kind]
    if (fixed !== undefined) {
      depthMemo.set(node.id, fixed)
      return fixed
    }
    if (seen.has(node.id)) return 3
    seen.add(node.id)
    const parentId = parent.get(node.id)
    const parentNode = parentId ? byId.get(parentId) : undefined
    const depth = parentNode ? Math.max(3, depthOf(parentNode, seen) + 1) : 3
    seen.delete(node.id)
    depthMemo.set(node.id, depth)
    return depth
  }

  const rows = new Map<number, CanvasNode[]>()
  for (const node of primaryNodes) {
    const depth = depthOf(node, new Set())
    const row = rows.get(depth) ?? []
    row.push(node)
    rows.set(depth, row)
  }

  const sortedDepths = [...rows.keys()].sort((a, b) => a - b)
  for (const depth of sortedDepths) {
    const row = rows.get(depth)!
    row.sort((a, b) => {
      const ra = ROLE_ORDER[a.kind] ?? 9
      const rb = ROLE_ORDER[b.kind] ?? 9
      if (ra !== rb) return ra - rb
      return a.order - b.order
    })
    const rowWidth = (row.length - 1) * COL_GAP
    const y = TOP + depth * ROW_GAP
    row.forEach((node, index) => {
      pos.set(node.id, { x: CENTER - rowWidth / 2 + index * COL_GAP, y })
    })
  }
  return pos
}

