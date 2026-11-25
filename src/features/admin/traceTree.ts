import type { AdminTraceEventRow } from './types'

/** Coarse category for a trace event, used for tree icons/labels and styling. */
export type TraceNodeKind = 'agent' | 'model' | 'tool' | 'skill' | 'other'

export interface TraceTreeNode {
  event: AdminTraceEventRow
  kind: TraceNodeKind
  label: string
  children: TraceTreeNode[]
}

export interface TraceTree {
  roots: TraceTreeNode[]
  byId: Map<string, TraceTreeNode>
}

/** Map an event_type string to a coarse node kind. */
export function traceNodeKind(eventType: string | null | undefined): TraceNodeKind {
  const type = (eventType ?? '').toLowerCase()
  if (type === 'agent' || type.startsWith('agent_') || type === 'delegation') return 'agent'
  if (type === 'model' || type.includes('model') || type.includes('llm')) return 'model'
  if (type === 'tool' || type.includes('tool')) return 'tool'
  if (type === 'skill' || type.includes('skill')) return 'skill'
  return 'other'
}

/** Human-friendly label for a node, preferring a tool/model name then role/id. */
export function traceNodeLabel(event: AdminTraceEventRow): string {
  const kind = traceNodeKind(event.event_type)
  if (kind === 'tool') return event.tool_name || event.operation || event.agent_id || 'tool'
  if (kind === 'skill') return event.agent_id || event.operation || 'skill'
  if (kind === 'model') return event.model || event.provider || event.agent_id || 'model'
  const role = event.agent_role || event.agent_id
  const op = event.operation ? ` · ${event.operation}` : ''
  return `${role || 'agent'}${op}`
}

function isAgentEvent(event: AdminTraceEventRow): boolean {
  return traceNodeKind(event.event_type) === 'agent'
}

/**
 * Build an expandable execution hierarchy from a flat, seq-ordered event list.
 *
 * Hierarchy is reconstructed from explicit `parent_event_id` links first, then
 * `parent_agent_id` / `instance_id` relationships, and finally a seq-ordered
 * fallback so repeated delegations and tool calls remain distinct, inspectable
 * entries. The function is pure and deterministic for a given event list.
 */
export function buildTraceTree(events: AdminTraceEventRow[]): TraceTree {
  const ordered = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const nodes = new Map<string, TraceTreeNode>()
  for (const event of ordered) {
    nodes.set(event.id, {
      event,
      kind: traceNodeKind(event.event_type),
      label: traceNodeLabel(event),
      children: [],
    })
  }

  const attached = new Set<string>()
  const attach = (childId: string, parentId: string) => {
    const parent = nodes.get(parentId)
    const child = nodes.get(childId)
    if (!parent || !child || parentId === childId) return
    parent.children.push(child)
    attached.add(childId)
  }

  // Pass 1: explicit parent_event_id links.
  for (const event of ordered) {
    const parentId = event.parent_event_id
    if (parentId && nodes.has(parentId)) attach(event.id, parentId)
  }

  // Index agent nodes by instance id for relationship-based attachment.
  const agentByInstance = new Map<string, TraceTreeNode>()
  for (const node of nodes.values()) {
    if (!isAgentEvent(node.event)) continue
    const instance = node.event.instance_id
    if (instance && !agentByInstance.has(instance)) agentByInstance.set(instance, node)
  }

  // Pass 2: parent_agent_id / instance_id relationships for still-detached nodes.
  for (const event of ordered) {
    if (attached.has(event.id)) continue
    const parentAgentId = event.parent_agent_id
    if (parentAgentId) {
      const parent = agentByInstance.get(parentAgentId)
      if (parent && parent.event.id !== event.id) {
        attach(event.id, parent.event.id)
        continue
      }
    }
    if (!isAgentEvent(event) && event.instance_id) {
      const owner = agentByInstance.get(event.instance_id)
      if (owner && owner.event.id !== event.id) {
        attach(event.id, owner.event.id)
        continue
      }
    }
  }

  // Pass 3: seq-ordered fallback — attach each remaining node to the nearest
  // preceding still-open agent ancestor, otherwise leave as a root.
  const lastAgentByDepth: TraceTreeNode[] = []
  for (const event of ordered) {
    if (attached.has(event.id)) {
      if (isAgentEvent(event)) {
        lastAgentByDepth.push(nodes.get(event.id)!)
      }
      continue
    }
    if (isAgentEvent(event)) {
      // A detached agent becomes a root (e.g. the orchestrator).
      lastAgentByDepth.push(nodes.get(event.id)!)
      continue
    }
    const owner = lastAgentByDepth[lastAgentByDepth.length - 1]
    if (owner && owner.event.id !== event.id) attach(event.id, owner.event.id)
  }

  const roots = ordered
    .map((event) => nodes.get(event.id)!)
    .filter((node) => !attached.has(node.event.id))

  return { roots, byId: nodes }
}