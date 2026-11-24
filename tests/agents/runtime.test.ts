import test from 'node:test'
import assert from 'node:assert/strict'
import { runAgentLoop, type RuntimeModelTurn } from '../../src/features/agents/runtime.ts'
import { runDirector, mockSpecialistRegistry } from '../../src/features/agents/director.ts'

function scripted(turns: RuntimeModelTurn[]) {
  let i = 0
  return async () => turns[Math.min(i++, turns.length - 1)]
}

test('runtime: model answers directly → completed', async () => {
  const result = await runAgentLoop(
    { role: 'director', systemPrompt: 'SYS', skillCatalog: [], contextBlock: '', task: 'advise' },
    { model: scripted([{ text: 'Here is my advice.', toolCalls: [] }]), act: async () => ({ ok: true, content: '' }), now: Date.now },
  )
  assert.equal(result.status, 'completed')
  assert.match(result.summary, /advice/)
})

test('runtime: completion gate blocks a zero-evidence answer until a tool runs', async () => {
  let i = 0
  const turns: RuntimeModelTurn[] = [
    { text: 'Fabricated answer with no evidence.', toolCalls: [] },
    { text: '', action: { type: 'tool_call', tool: 'tavily_search', args: { query: 'x' } } },
    { text: 'Now grounded answer.', toolCalls: [] },
  ]
  const result = await runAgentLoop(
    {
      role: 'research',
      systemPrompt: 'SYS',
      skillCatalog: [],
      contextBlock: '',
      task: 'research',
      gateCompletion: ({ invokedTools }) => (invokedTools.has('tavily_search') ? null : 'Gather real evidence first.'),
      maxCompletionBlocks: 3,
    },
    {
      model: async () => turns[Math.min(i++, turns.length - 1)],
      act: async () => ({ ok: true, content: 'hit' }),
      now: Date.now,
    },
  )
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.invokedTools, ['tavily_search'])
  assert.match(result.summary, /grounded/)
})

test('runtime: completion gate exhausted → partial, never fabricated success', async () => {
  const result = await runAgentLoop(
    {
      role: 'research',
      systemPrompt: 'SYS',
      skillCatalog: [],
      contextBlock: '',
      task: 'research',
      gateCompletion: () => 'Gather real evidence first.',
      maxCompletionBlocks: 2,
    },
    {
      model: scripted([{ text: 'Still fabricated.', toolCalls: [] }]),
      act: async () => ({ ok: true, content: '' }),
      now: Date.now,
    },
  )
  assert.equal(result.status, 'partial')
})

test('runtime: read_skill counts distinct successful loads only', async () => {
  const result = await runAgentLoop(
    { role: 'director', systemPrompt: 'SYS', skillCatalog: [{ id: 'a', name: 'A', description: '' }], contextBlock: '', task: 'x' },
    {
      model: scripted([
        { text: '', action: { type: 'read_skill', skillId: 'a' } },
        { text: '', action: { type: 'read_skill', skillId: 'a' } },
        { text: 'done', action: { type: 'answer', text: 'done' } },
      ]),
      act: async () => ({ ok: true, content: 'skill body' }),
      now: Date.now,
    },
  )
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.loadedSkills, ['a'])
  assert.equal(result.steps, 3)
})

test('runtime: ask_clarification → awaiting_input', async () => {
  const result = await runAgentLoop(
    { role: 'director', systemPrompt: 'SYS', skillCatalog: [], contextBlock: '', task: 'x' },
    { model: scripted([{ text: 'Which one?', action: { type: 'ask_clarification', questions: [] } }]), act: async () => ({ ok: true, content: '' }), now: Date.now },
  )
  assert.equal(result.status, 'awaiting_input')
  assert.equal(result.awaitingInput, true)
})

test('runtime: tool_call records invoked tool', async () => {
  const result = await runAgentLoop(
    { role: 'marketing_analyst', systemPrompt: 'SYS', skillCatalog: [], contextBlock: '', task: 'x' },
    {
      model: scripted([
        { text: '', action: { type: 'tool_call', tool: 'calculate', args: { formula: 'roas', values: { attributedValue: 5, spend: 1 } } } },
        { text: 'ROAS is 5x', action: { type: 'answer', text: 'ROAS is 5x' } },
      ]),
      act: async () => ({ ok: true, content: '{"value":5}' }),
      now: Date.now,
    },
  )
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.invokedTools, ['calculate'])
})

test('Director: delegates to a mock specialist and records the result', async () => {
  const result = await runDirector(
    { originalRequest: 'Research competitors', contextBlock: 'Brain: coffee shop' },
    {
      model: scripted([
        { text: '', action: { type: 'delegate', specialist: 'research', goal: 'Find 3 competitors', scope: 'Cairo' } },
        { text: 'Here is the research summary.', action: { type: 'answer', text: 'Here is the research summary.' } },
      ]),
      now: Date.now,
      readSkill: async () => null,
      executeTool: async () => ({ ok: true, output: {} }),
      specialists: mockSpecialistRegistry(),
      workspaceId: 'w1',
    },
  )
  assert.equal(result.role, 'director')
  assert.equal(result.specialistResults.length, 1)
  assert.equal(result.specialistResults[0].specialist, 'research')
  assert.ok(result.specialistResults[0].summary.includes('MOCK'))
})

test('Director: loads a skill via readSkill dep', async () => {
  let skillReads = 0
  const result = await runDirector(
    { originalRequest: 'Build a campaign', contextBlock: '' },
    {
      model: scripted([
        { text: '', action: { type: 'read_skill', skillId: 'campaign-strategy' } },
        { text: 'Campaign plan ready.', action: { type: 'answer', text: 'Campaign plan ready.' } },
      ]),
      now: Date.now,
      readSkill: async (id) => { skillReads++; return { id, version: '1.0.0', contentHash: 'h', body: 'Campaign strategy body.' } },
      executeTool: async () => ({ ok: true, output: {} }),
      specialists: mockSpecialistRegistry(),
      workspaceId: 'w1',
    },
  )
  assert.ok(skillReads >= 1)
  assert.deepEqual(result.loadedSkills, ['campaign-strategy'])
})

test('runtime: native toolCalls load skills, execute parallel tools, and deliver skill body to next turn', async () => {
  const seenMessages: string[] = []
  let turn = 0
  const result = await runAgentLoop(
    {
      role: 'director',
      systemPrompt: 'SYS_DIRECTOR',
      skillCatalog: [{ id: 'marketing-strategy', name: 'Marketing Strategy', description: 'Strategy' }],
      contextBlock: 'Brain: Coffee',
      task: 'Create launch strategy',
    },
    {
      model: async (messages) => {
        turn += 1
        seenMessages.push(JSON.stringify(messages))
        if (turn === 1) {
          return {
            text: '',
            toolCalls: [{ id: 'tc-skill', name: 'read_skill', args: { skillId: 'marketing-strategy' } }],
          }
        }
        if (turn === 2) {
          // Verify skill body actually arrived in subsequent model request
          assert.ok(messages.some((m) => m.role === 'tool' && m.content.includes('EGYPT_FIRST_RULE')))
          return {
            text: '',
            toolCalls: [
              { id: 'tc-d1', name: 'delegate_agent', args: { specialist: 'research', goal: 'Market check', scope: 'Cairo' } },
              { id: 'tc-d2', name: 'delegate_agent', args: { specialist: 'marketing_analyst', goal: 'KPI check', scope: 'Week A/B' } },
            ],
          }
        }
        return { text: 'Synthesized final strategy.', toolCalls: [] }
      },
      act: async (action) => {
        if (action.type === 'read_skill') return { ok: true, content: 'Skill body: EGYPT_FIRST_RULE' }
        if (action.type === 'delegate') return { ok: true, content: `Done ${action.specialist}` }
        return { ok: true, content: 'ok' }
      },
      now: Date.now,
    },
  )

  assert.equal(result.status, 'completed')
  assert.deepEqual(result.loadedSkills, ['marketing-strategy'])
  assert.equal(result.delegations.length, 2)
  assert.equal(turn, 3)
  assert.ok(seenMessages[1].includes('SYS_DIRECTOR'))
})

test('Director: request_revision re-invokes specialist with defect and desired correction', async () => {
  let specialistCalls = 0
  let turn = 0
  const result = await runDirector(
    { originalRequest: 'Find competitors', contextBlock: 'Brain: Coffee' },
    {
      model: async () => {
        turn += 1
        if (turn === 1) return { text: '', toolCalls: [{ id: 'd1', name: 'delegate_agent', args: { specialist: 'research', goal: 'Find Cairo coffee shops', scope: 'Cairo' } }] }
        if (turn === 2) return { text: '', toolCalls: [{ id: 'r1', name: 'request_agent_revision', args: { targetInstanceId: 'inst-research-1', defect: 'Missing 250g price', desired: 'Include 250g bean prices' } }] }
        return { text: 'Reviewed and accepted revised research.', toolCalls: [] }
      },
      now: Date.now,
      readSkill: async () => null,
      executeTool: async () => ({ ok: true, output: {} }),
      specialists: {
        async run(specialist, subtask) {
          specialistCalls += 1
          if (specialistCalls === 1) {
            return { instanceId: 'inst-research-1', specialist, status: 'completed', summary: 'Found shop A without price', evidenceRefs: ['https://shop-a.eg'], limitations: [] }
          }
          assert.equal(subtask.revisionContext?.defect, 'Missing 250g price')
          return { instanceId: 'inst-research-2', specialist, status: 'completed', summary: 'Found shop A 250g EGP 250', evidenceRefs: ['https://shop-a.eg'], limitations: [] }
        },
      },
      workspaceId: 'w1',
    },
  )

  assert.equal(specialistCalls, 2)
  assert.equal(result.specialistResults.length, 2)
  assert.equal(result.status, 'completed')
})

test('Director: refuses create_or_version_deliverable when content cites unretrieved URL', async () => {
  let persistCalled = false
  let turn = 0
  const result = await runDirector(
    { originalRequest: 'Write report', contextBlock: '' },
    {
      model: async () => {
        turn += 1
        if (turn === 1) {
          return {
            text: '',
            toolCalls: [{ id: 'p1', name: 'create_or_version_deliverable', args: { title: 'Report', type: 'research', content: 'See https://fake-url-not-retrieved.com' } }],
          }
        }
        return { text: 'Unable to verify external URLs; no unverified report saved.', toolCalls: [] }
      },
      now: Date.now,
      readSkill: async () => null,
      executeTool: async () => { persistCalled = true; return { ok: true, output: { deliverableId: 'd1' } } },
      specialists: mockSpecialistRegistry(),
      workspaceId: 'w1',
    },
  )

  assert.equal(persistCalled, false)
  assert.equal(result.status, 'completed')
})