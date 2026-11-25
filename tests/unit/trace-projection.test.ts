import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { projectTraceEvents, type TraceEventLike } from '../../src/server/employee/trace-projection'
import { buildAgentGraph } from '../../src/components/chat/agentCanvasGraph'

function agentEvent(overrides: Partial<TraceEventLike>): TraceEventLike {
  return {
    id: 'e-agent',
    seq: 0,
    event_type: 'agent',
    agent_id: 'inst-1',
    agent_role: 'orchestrator',
    instance_id: 'inst-1',
    status: 'completed',
    metadata: { label: 'Orchestrator' },
    ...overrides,
  }
}

describe('projectTraceEvents', () => {
  it('drops model events and maps agent/tool/skill to canvas events', () => {
    const projected = projectTraceEvents([
      agentEvent({ id: 'a', seq: 0 }),
      { id: 'm', seq: 1, event_type: 'model', agent_id: 'model' },
      {
        id: 't',
        seq: 2,
        event_type: 'tool',
        agent_id: 'search',
        tool_name: 'search',
        instance_id: 'inst-1',
        status: 'completed',
      },
      {
        id: 's',
        seq: 3,
        event_type: 'skill',
        agent_id: 'seo-basics',
        instance_id: 'inst-1',
        status: 'loaded',
      },
    ])

    assert.equal(projected.length, 3)
    assert.deepEqual(projected.map((e) => e.event_type), ['agent', 'tool_call', 'skill_read'])

    const tool = projected[1]
    assert.equal(tool.agent_id, 'search')
    assert.equal(tool.agent_role, 'tool')
    assert.equal(tool.parent_instance_id, 'inst-1')
    assert.notEqual(tool.instance_id, 'inst-1')

    const skill = projected[2]
    assert.equal(skill.agent_id, 'seo-basics')
    assert.equal(skill.parent_instance_id, 'inst-1')
  })

  it('feeds buildAgentGraph so tools/skills attach to their agent as chips', () => {
    const events = projectTraceEvents([
      agentEvent({ id: 'a', seq: 0, instance_id: 'inst-1' }),
      {
        id: 't',
        seq: 1,
        event_type: 'tool',
        agent_id: 'search',
        tool_name: 'search',
        instance_id: 'inst-1',
        status: 'completed',
      },
      {
        id: 's',
        seq: 2,
        event_type: 'skill',
        agent_id: 'seo-basics',
        instance_id: 'inst-1',
        status: 'loaded',
      },
    ])

    const graph = buildAgentGraph({ events, userMessage: 'hello' })
    const agent = graph.nodes.find((n) => n.kind === 'orchestrator')!
    assert.ok(agent, 'orchestrator node exists')

    const toolNode = graph.nodes.find((n) => n.kind === 'tool')!
    const skillNode = graph.nodes.find((n) => n.kind === 'skill')!
    assert.ok(toolNode && skillNode)

    const toolEdge = graph.edges.find((e) => e.to === toolNode.id)!
    const skillEdge = graph.edges.find((e) => e.to === skillNode.id)!
    assert.equal(toolEdge.kind, 'tool_call')
    assert.equal(toolEdge.from, agent.id)
    assert.equal(skillEdge.kind, 'skill_read')
    assert.equal(skillEdge.from, agent.id)
  })

  it('connects parent and child agents even when only parent_event_id is set', () => {
    const projected = projectTraceEvents([
      agentEvent({ id: 'e1', seq: 0, instance_id: 'orch-1', agent_id: 'orch-1', agent_role: 'orchestrator' }),
      agentEvent({
        id: 'e2',
        seq: 1,
        instance_id: 'dir-1',
        agent_id: 'dir-1',
        agent_role: 'director',
        parent_agent_id: null,
        parent_event_id: 'orch-1',
        metadata: { label: 'director' },
      }),
    ])

    const graph = buildAgentGraph({ events: projected, userMessage: 'اعمل خطة' })
    const edge = graph.edges.find((e) => e.from === 'orch-1' && e.to === 'dir-1')
    assert.ok(edge, 'edge between orchestrator and director must exist')
  })

  it('never emits nodes for model or unknown event types', () => {
    const projected = projectTraceEvents([
      { id: 'm', seq: 0, event_type: 'model', agent_id: 'model' },
      { id: 'x', seq: 1, event_type: 'audit', agent_id: 'x' },
    ])
    assert.equal(projected.length, 0)
  })
})