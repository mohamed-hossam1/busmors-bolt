import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { describeLiveTraceStep } from '../../src/server/employee/live-status'
import { TraceCollector } from '../../src/server/observability/collector'

const prevObs = process.env.OBSERVABILITY_ENABLED
before(() => {
  process.env.OBSERVABILITY_ENABLED = 'true'
})
after(() => {
  if (prevObs === undefined) delete process.env.OBSERVABILITY_ENABLED
  else process.env.OBSERVABILITY_ENABLED = prevObs
})

describe('describeLiveTraceStep', () => {
  it('returns clear Arabic and English labels for agents, tools, and skills', () => {
    const arOrch = describeLiveTraceStep(
      { id: '1', seq: 0, event_type: 'agent', agent_role: 'orchestrator', status: 'running' },
      true,
    )
    const arDir = describeLiveTraceStep(
      { id: '2', seq: 1, event_type: 'agent', agent_role: 'director', status: 'running' },
      true,
    )
    const arTool = describeLiveTraceStep(
      { id: '3', seq: 2, event_type: 'tool', tool_name: 'read_business_brain', status: 'running' },
      true,
    )
    const enSkill = describeLiveTraceStep(
      { id: '4', seq: 3, event_type: 'skill', agent_id: 'campaign-strategy', status: 'loaded' },
      false,
    )

    assert.ok(arOrch && arOrch.includes('فهم'))
    assert.ok(arDir && arDir.includes('مدير التسويق'))
    assert.ok(arTool && arTool.includes('ذاكرة المشروع'))
    assert.equal(enSkill, 'Applying playbook: campaign-strategy...')
  })
})

describe('TraceCollector.subscribe', () => {
  it('notifies subscribers synchronously as events arrive and supports unsubscribe', () => {
    const collector = new TraceCollector(
      { traceId: '11111111-1111-4111-8111-111111111111' },
      { enabled: true, sink: async () => {} },
    )
    const seen: string[] = []
    const unsub = collector.subscribe((event) => {
      seen.push(`${event.event_type}:${event.agent_id}`)
    })

    collector.recordAgent({
      agentId: '22222222-2222-4222-8222-222222222222',
      agentRole: 'orchestrator',
      status: 'running',
      instanceId: '22222222-2222-4222-8222-222222222222',
    })
    collector.recordTool({
      toolName: 'read_business_brain',
      status: 'completed',
      instanceId: '22222222-2222-4222-8222-222222222222',
    })
    unsub()
    collector.recordSkill({
      skillId: 'campaign-strategy',
      outcome: 'loaded',
      instanceId: '22222222-2222-4222-8222-222222222222',
    })

    assert.deepEqual(seen, [
      'agent:22222222-2222-4222-8222-222222222222',
      'tool:read_business_brain',
    ])
  })
})
