import test from 'node:test'
import assert from 'node:assert/strict'
import { runSpecialist, specialistSkillCatalog } from '../../src/features/agents/specialist.ts'
import { buildAgentCanvas, canvasCounts, type CanvasAgentEvent } from '../../src/features/agents/canvas.ts'

function scripted(turns: { text: string; action?: import('../../src/features/agents/contracts.ts').AgentAction }[]) {
  let i = 0
  return async () => turns[Math.min(i++, turns.length - 1)]
}

test('specialist: analyst uses calculate tool and returns result', async () => {
  const result = await runSpecialist(
    'marketing_analyst',
    { goal: 'Compute ROAS', scope: 'Week A', contextBlock: 'spend 1600, value 8000' },
    {
      model: scripted([
        { text: '', action: { type: 'tool_call', tool: 'calculate', args: { formula: 'roas', values: { attributedValue: 8000, spend: 1600 } } } },
        { text: 'ROAS is 5.0x', action: { type: 'answer', text: 'ROAS is 5.0x' } },
      ]),
      now: Date.now,
      readSkill: async () => null,
      executeTool: async () => ({ ok: true, output: { value: 5 } }),
    },
  )
  assert.equal(result.role, 'marketing_analyst')
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.invokedTools, ['calculate'])
})

test('specialist: research has exactly five skills in catalog', () => {
  assert.equal(specialistSkillCatalog('research').length, 5)
  assert.equal(specialistSkillCatalog('content').length, 7)
  assert.equal(specialistSkillCatalog('marketing_analyst').length, 7)
})

test('specialist: cannot delegate (delegation rejected by act)', async () => {
  const result = await runSpecialist(
    'research',
    { goal: 'x', scope: 'y', contextBlock: '' },
    {
      model: scripted([
        { text: '', action: { type: 'delegate', specialist: 'content', goal: 'g', scope: 's' } },
        { text: 'done', action: { type: 'answer', text: 'done' } },
      ]),
      now: Date.now,
      readSkill: async () => null,
      executeTool: async () => ({ ok: true, output: {} }),
    },
  )
  // Delegation from a specialist is not recorded as a delegation.
  assert.equal(result.delegations.length, 0)
})

test('canvas: builds Orchestrator → Director → specialist hierarchy from real events', () => {
  const events: CanvasAgentEvent[] = [
    { instanceId: 'o1', agentId: 'orchestrator', role: 'orchestrator', status: 'completed', type: 'agent_started' },
    { instanceId: 'd1', parentInstanceId: 'o1', agentId: 'director', role: 'director', status: 'completed', type: 'delegation' },
    { instanceId: 'd1', agentId: 'director', role: 'director', status: 'completed', type: 'skill_read', skillId: 'campaign-strategy' },
    { instanceId: 'd1', agentId: 'director', role: 'director', status: 'completed', type: 'tool_call', toolName: 'read_business_brain' },
    { instanceId: 'r1', parentInstanceId: 'd1', agentId: 'research', role: 'research', status: 'completed', type: 'delegation' },
    { instanceId: 'r1', agentId: 'research', role: 'research', status: 'completed', type: 'skill_read', skillId: 'market-research' },
    { instanceId: 'r1', agentId: 'research', role: 'research', status: 'completed', type: 'tool_call', toolName: 'tavily_search' },
  ]
  const roots = buildAgentCanvas(events)
  assert.equal(roots.length, 1)
  assert.equal(roots[0].agentId, 'orchestrator')
  assert.equal(roots[0].skills.length, 0) // Orchestrator has no skills
  const director = roots[0].children[0]
  assert.equal(director.agentId, 'director')
  assert.deepEqual(director.skills, ['campaign-strategy'])
  assert.deepEqual(director.tools, ['read_business_brain'])
  const research = director.children[0]
  assert.equal(research.agentId, 'research')
  assert.deepEqual(research.skills, ['market-research'])
  const counts = canvasCounts(roots)
  assert.equal(counts.agents, 3)
  assert.equal(counts.skills, 2)
  assert.equal(counts.tools, 2)
})

test('canvas: repeated calls do not create duplicate nodes or counts', () => {
  const events: CanvasAgentEvent[] = [
    { instanceId: 'o1', agentId: 'orchestrator', role: 'orchestrator', status: 'completed', type: 'agent_started' },
    { instanceId: 'o1', agentId: 'orchestrator', role: 'orchestrator', status: 'completed', type: 'tool_call', toolName: 'read_business_brain' },
    { instanceId: 'o1', agentId: 'orchestrator', role: 'orchestrator', status: 'completed', type: 'tool_call', toolName: 'read_business_brain' },
  ]
  const roots = buildAgentCanvas(events)
  assert.equal(roots.length, 1)
  assert.deepEqual(roots[0].tools, ['read_business_brain'])
})