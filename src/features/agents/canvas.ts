/**
 * Customer Agent Canvas projection (spec §10).
 *
 * Built from ACTUAL execution events only: agent instances with parent links,
 * plus the distinct skills actually loaded and tools actually invoked per agent.
 * No model/reasoning/internal-step nodes; no synthetic activity; no empty circles.
 * The Orchestrator has no Skills circle. Repeated calls never create new nodes.
 *
 * Pure and client-safe (no server imports) so both the customer Canvas and tests
 * use the same projection.
 */

export interface CanvasAgentNode {
  instanceId: string
  agentId: string
  role: string
  parentInstanceId: string | null
  status: string
  label: string
  /** Distinct skills actually and successfully loaded (names only on click). */
  skills: string[]
  /** Distinct tools actually invoked (names only on click). */
  tools: string[]
  children: CanvasAgentNode[]
}

export interface CanvasAgentEvent {
  instanceId: string
  parentInstanceId?: string | null
  agentId: string
  role: string
  status: string
  label?: string
  type: 'agent_started' | 'agent_completed' | 'agent_error' | 'tool_call' | 'skill_read' | 'delegation' | 'flow_connection'
  toolName?: string
  skillId?: string
}

/**
 * Project a flat list of real canvas events into the agent hierarchy. Each unique
 * instanceId is one node; skill/tool events attach to their owning instance.
 */
export function buildAgentCanvas(events: CanvasAgentEvent[]): CanvasAgentNode[] {
  const nodes = new Map<string, CanvasAgentNode>()
  const ensure = (event: CanvasAgentEvent): CanvasAgentNode => {
    let node = nodes.get(event.instanceId)
    if (!node) {
      node = {
        instanceId: event.instanceId,
        agentId: event.agentId,
        role: event.role,
        parentInstanceId: event.parentInstanceId ?? null,
        status: event.status,
        label: event.label ?? event.agentId,
        skills: [],
        tools: [],
        children: [],
      }
      nodes.set(event.instanceId, node)
    }
    // Latest status wins; keep the first label.
    node.status = event.status
    if (event.label && node.label === node.agentId) node.label = event.label
    return node
  }

  for (const event of events) {
    if (event.type === 'skill_read') {
      const owner = nodes.get(event.instanceId)
      if (owner && event.skillId && !owner.skills.includes(event.skillId)) owner.skills.push(event.skillId)
      continue
    }
    if (event.type === 'tool_call') {
      const owner = nodes.get(event.instanceId)
      if (owner && event.toolName && !owner.tools.includes(event.toolName)) owner.tools.push(event.toolName)
      continue
    }
    ensure(event)
  }

  // Link children by parentInstanceId.
  const roots: CanvasAgentNode[] = []
  for (const node of nodes.values()) {
    if (node.parentInstanceId && nodes.has(node.parentInstanceId)) {
      const parent = nodes.get(node.parentInstanceId)!
      if (!parent.children.includes(node)) parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/** Count of distinct skills/tools actually used across the whole canvas. */
export function canvasCounts(nodes: CanvasAgentNode[]): { agents: number; skills: number; tools: number } {
  let agents = 0
  const skills = new Set<string>()
  const tools = new Set<string>()
  const walk = (list: CanvasAgentNode[]) => {
    for (const node of list) {
      agents += 1
      for (const s of node.skills) skills.add(`${node.instanceId}:${s}`)
      for (const t of node.tools) tools.add(`${node.instanceId}:${t}`)
      walk(node.children)
    }
  }
  walk(nodes)
  return { agents, skills: skills.size, tools: tools.size }
}