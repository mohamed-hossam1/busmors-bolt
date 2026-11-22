import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAgentGraph, graphFingerprint, nodeById, type PersistedEvent, type PersistedStep } from '../../src/features/research/canvas/graph'

const events: PersistedEvent[] = [
  { seq: 1, event_type: 'agent_started', agent_id: 'research_director', agent_role: 'director', instance_id: 'i1', status: 'running', public_message: 'Planning', redacted_parameters: { mode: 'standard' }, source_ids: [], consumption: { calls: 0, pages: 0, tokens: 0, credits: 0 }, started_at: '2026-10-01T10:00:00Z' },
  { seq: 2, event_type: 'delegation', agent_id: 'market_scout', agent_role: 'subagent', instance_id: 'i2', parent_instance_id: 'i1', status: 'running', public_message: 'Map the market', redacted_parameters: { budget: { calls: 8 } }, source_ids: [], consumption: { calls: 0, pages: 0, tokens: 0, credits: 0 }, started_at: '2026-10-01T10:00:01Z' },
  { seq: 3, event_type: 'tool_call', agent_id: 'tavily', agent_role: 'tool', instance_id: 'i3', status: 'completed', public_message: 'Searched', redacted_parameters: { query: 'ceramic repair' }, source_ids: ['s1', 's2'], consumption: { calls: 1, pages: 0, tokens: 600, credits: 1 }, started_at: '2026-10-01T10:00:02Z', ended_at: '2026-10-01T10:00:03Z' },
  { seq: 4, event_type: 'skill_read', agent_id: 'egypt-market-demand-scout', agent_role: 'skill', instance_id: 'i4', status: 'completed', public_message: 'Read the Egyptian skill', redacted_parameters: {}, source_ids: [], consumption: { calls: 0, pages: 0, tokens: 0, credits: 0 }, started_at: '2026-10-01T10:00:04Z', ended_at: '2026-10-01T10:00:04Z' },
  { seq: 5, event_type: 'agent_completed', agent_id: 'market_scout', agent_role: 'subagent', instance_id: 'i2', status: 'completed', public_message: 'Market frame ready', redacted_parameters: {}, source_ids: ['s1'], consumption: { calls: 1, pages: 1, tokens: 900, credits: 1 }, started_at: '2026-10-01T10:00:01Z', ended_at: '2026-10-01T10:00:05Z' },
  { seq: 6, event_type: 'flow_connection', agent_id: 'research_director', agent_role: 'director', instance_id: 'i1', status: 'completed', public_message: 'delegates to market_scout', payload: { from: 'i1', to: 'i2', label: 'delegates to market_scout' }, source_ids: [], consumption: { calls: 0, pages: 0, tokens: 0, credits: 0 } },
]

test('canvas: nodes carry kind, state and consumption from persisted events', () => {
  const graph = buildAgentGraph({ events, running: true })
  const director = graph.nodes.find(node => node.agentId === 'research_director')
  assert.equal(director?.kind, 'director')
  assert.equal(director?.state, 'running')
  const tool = graph.nodes.find(node => node.agentId === 'tavily')
  assert.equal(tool?.kind, 'tool')
  assert.equal(tool?.sources, 2)
  assert.equal(tool?.consumption.credits, 1)
  const skill = graph.nodes.find(node => node.agentId === 'egypt-market-demand-scout')
  assert.equal(skill?.kind, 'skill')
  assert.equal(graph.directorId, 'i1')
})

test('canvas: edges include delegation and flow connections with their public message', () => {
  const graph = buildAgentGraph({ events, running: true })
  assert.ok(graph.edges.some(edge => edge.kind === 'delegation' && edge.message === 'Map the market'))
  assert.ok(graph.edges.some(edge => edge.kind === 'flow' && edge.from === 'i1' && edge.to === 'i2'))
})

test('canvas: a persisted step without an event still produces a node', () => {
  const steps: PersistedStep[] = [{ id: 'i9', agent: 'brand_positioning', label: 'Brand positioning', status: 'completed', started_at: '2026-10-01T10:10:00Z', completed_at: '2026-10-01T10:11:00Z' }]
  const graph = buildAgentGraph({ events: [], steps, running: false })
  assert.equal(graph.nodes.length, 1)
  assert.equal(graph.nodes[0].state, 'completed')
  assert.equal(graph.nodes[0].kind, 'subagent')
})

test('canvas: a failure is visible and refresh rebuilds the same sequence', () => {
  const failing: PersistedEvent[] = [
    ...events,
    { seq: 7, event_type: 'agent_error', agent_id: 'competitor_intelligence', agent_role: 'subagent', instance_id: 'i5', status: 'failed', public_message: 'Provider unavailable', redacted_parameters: {}, source_ids: [], consumption: { calls: 0, pages: 0, tokens: 0, credits: 0 }, failure_reason: 'unavailable', started_at: '2026-10-01T10:12:00Z', ended_at: '2026-10-01T10:12:01Z' },
  ]
  const first = buildAgentGraph({ events: failing, running: true })
  const second = buildAgentGraph({ events: failing, running: true })
  assert.equal(graphFingerprint(first), graphFingerprint(second))
  const failed = nodeById(first, 'i5')
  assert.equal(failed?.state, 'failed')
  assert.equal(failed?.failureReason, 'unavailable')
})

test('canvas: unknown event types never invent a node', () => {
  const graph = buildAgentGraph({ events: [{ seq: 1, event_type: 'agent_started', agent_id: 'x', instance_id: 'ix', status: 'queued', source_ids: [], consumption: {} }], running: true })
  assert.equal(graph.nodes.length, 1)
  assert.equal(graph.nodes[0].state, 'queued')
})