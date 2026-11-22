import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentGraph, type PersistedEvent } from '../../src/features/research/canvas/graph'

function ev(over: Partial<PersistedEvent> & { seq: number }): PersistedEvent {
  return { event_type: 'agent_started', agent_id: 'orchestrator', agent_role: 'orchestrator', status: 'running', source_ids: [], consumption: {}, ...over } as PersistedEvent
}

test('canvas: direct path shows User -> Orchestrator only (no Brain, no Director)', () => {
  const events: PersistedEvent[] = [
    ev({ seq: 1, instance_id: 'o1', parent_instance_id: null, payload: { task_summary: 'Understanding your request' } }),
    ev({ seq: 2, instance_id: 'o1', parent_instance_id: null, event_type: 'agent_completed', status: 'completed', payload: { task_summary: 'Answered directly' } }),
  ]
  const g = buildAgentGraph({ events, userMessage: 'Hello' })
  assert.ok(g.nodes.some(n => n.kind === 'orchestrator'))
  assert.ok(!g.nodes.some(n => n.kind === 'tool'))
  assert.ok(!g.nodes.some(n => n.kind === 'director'))
  assert.equal(g.entryId, 'o1')
  assert.ok(g.edges.some(e => e.from === 'user' && e.to === 'o1'))
})

test('canvas: brain path shows Orchestrator -> Brain tool -> Orchestrator', () => {
  const events: PersistedEvent[] = [
    ev({ seq: 1, instance_id: 'o1', parent_instance_id: null, payload: { task_summary: 'Understanding your request' } }),
    ev({ seq: 2, instance_id: 'b1', agent_id: 'brain', agent_role: 'tool', event_type: 'tool_call', parent_instance_id: 'o1', payload: { task_summary: 'Brain retrieval' } }),
    ev({ seq: 3, instance_id: 'b1', agent_id: 'brain', agent_role: 'tool', event_type: 'agent_completed', status: 'completed', parent_instance_id: 'o1', payload: { task_summary: 'Brain retrieval' } }),
    ev({ seq: 4, instance_id: 'o1', parent_instance_id: null, event_type: 'agent_completed', status: 'completed', payload: { task_summary: 'Answered from company knowledge' } }),
  ]
  const g = buildAgentGraph({ events, userMessage: 'What products do we sell?' })
  const brain = g.nodes.find(n => n.agentId === 'brain')
  assert.ok(brain)
  assert.equal(brain!.kind, 'tool')
  assert.equal(brain!.state, 'completed')
  assert.ok(!g.nodes.some(n => n.kind === 'director'))
  assert.ok(g.edges.some(e => e.from === 'o1' && e.to === 'b1' && e.kind === 'tool_call'))
})

test('canvas: task path shows Orchestrator -> Director handoff -> executor', () => {
  const events: PersistedEvent[] = [
    ev({ seq: 1, instance_id: 'o1', parent_instance_id: null, payload: { task_summary: 'Understanding your request' } }),
    ev({ seq: 2, instance_id: 'd1', agent_id: 'director', agent_role: 'director', event_type: 'delegation', parent_instance_id: 'o1', payload: { task_summary: 'Hand off to Director to create content' } }),
    ev({ seq: 3, instance_id: 'cw1', agent_id: 'content_writer', agent_role: 'subagent', event_type: 'agent_started', parent_instance_id: null, payload: { task_summary: 'Write the requested Post drafts' } }),
    ev({ seq: 4, instance_id: 'cw1', agent_id: 'content_writer', agent_role: 'subagent', event_type: 'agent_completed', status: 'completed', parent_instance_id: null, payload: { task_summary: 'Write the requested Post drafts' } }),
    ev({ seq: 5, instance_id: 'd1', agent_id: 'director', agent_role: 'director', event_type: 'agent_completed', status: 'completed', parent_instance_id: 'o1', payload: { task_summary: 'Hand off to Director to create content' } }),
  ]
  const g = buildAgentGraph({ events, userMessage: 'Create 10 posts' })
  const director = g.nodes.find(n => n.agentId === 'director')
  const writer = g.nodes.find(n => n.agentId === 'content_writer')
  assert.ok(director)
  assert.ok(writer)
  assert.equal(director!.kind, 'director')
  assert.ok(g.edges.some(e => e.from === 'o1' && e.to === 'd1' && e.kind === 'delegation'))
  // The handoff connects to the executor's root node so the path reads Director -> work.
  assert.ok(g.edges.some(e => e.from === 'd1' && e.to === 'cw1'))
})

test('canvas: no fabricated nodes when only the orchestrator answered', () => {
  const events: PersistedEvent[] = [
    ev({ seq: 1, instance_id: 'o1', parent_instance_id: null, payload: { task_summary: 'Understanding your request' } }),
    ev({ seq: 2, instance_id: 'o1', event_type: 'agent_completed', status: 'completed', parent_instance_id: null, payload: { task_summary: 'Answered directly' } }),
  ]
  const g = buildAgentGraph({ events, userMessage: 'Hi' })
  // Exactly User + Orchestrator, nothing invented.
  assert.equal(g.nodes.length, 2)
  assert.ok(g.nodes.some(n => n.kind === 'user'))
  assert.ok(g.nodes.some(n => n.kind === 'orchestrator'))
})