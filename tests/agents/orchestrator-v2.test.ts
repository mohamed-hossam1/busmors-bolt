import test from 'node:test'
import assert from 'node:assert/strict'
import { runOrchestratorV2, buildOrchestratorContext, type ModelTurn } from '../../src/features/orchestrator/v2-runtime.ts'

function scripted(turns: ModelTurn[]) {
  let i = 0
  return async () => turns[Math.min(i++, turns.length - 1)]
}

function makeDeps(model: () => Promise<ModelTurn>, executed: string[] = [], toolImpl?: (name: string, args: Record<string, unknown>) => Promise<{ ok: boolean; output?: unknown; error?: string }>) {
  return {
    model,
    executeTool: async (name: string, args: Record<string, unknown>) => {
      executed.push(name)
      if (toolImpl) return toolImpl(name, args)
      return { ok: true, output: {} }
    },
    now: Date.now,
  }
}

test('simple chat: model answers directly with no tool call', async () => {
  const executed: string[] = []
  const deps = makeDeps(scripted([{ text: 'Hello! How can I help your business?', toolCalls: [] }]), executed)
  const result = await runOrchestratorV2({ systemPrompt: 'SYS', request: 'hello', history: [], contextBlock: '' }, deps)
  assert.equal(result.kind, 'answer')
  if (result.kind === 'answer') assert.match(result.reply, /help/)
  assert.equal(executed.length, 0)
})

test('brain question: model calls read_business_brain then answers', async () => {
  const executed: string[] = []
  const deps = makeDeps(
    scripted([
      { text: '', toolCalls: [{ id: '1', name: 'read_business_brain', args: { query: 'price' } }] },
      { text: 'Our coffee is EGP 220 for 250g.', toolCalls: [] },
    ]),
    executed,
  )
  const result = await runOrchestratorV2({ systemPrompt: 'SYS', request: 'what is our price?', history: [], contextBlock: 'Brain: (none)' }, deps)
  assert.equal(result.kind, 'answer')
  assert.ok(executed.includes('read_business_brain'))
})

test('propose brain change: model calls propose_brain_change', async () => {
  const executed: string[] = []
  const deps = makeDeps(
    scripted([
      { text: '', toolCalls: [{ id: '1', name: 'propose_brain_change', args: { change: 'add', category: 'offering', title: 'Tea', proposedValue: 'EGP 50', source: 'chat', rationale: 'new' } }] },
      { text: 'I proposed adding Tea to your Business Brain for approval.', toolCalls: [] },
    ]),
    executed,
  )
  const result = await runOrchestratorV2({ systemPrompt: 'SYS', request: 'add tea', history: [], contextBlock: '' }, deps)
  assert.equal(result.kind, 'answer')
  assert.ok(executed.includes('propose_brain_change'))
})

test('delegation: delegate_to_director yields a delegated outcome', async () => {
  const executed: string[] = []
  const deps = makeDeps(
    scripted([
      { text: '', toolCalls: [{ id: '1', name: 'delegate_to_director', args: { originalRequest: 'Build a campaign', intendedOutcome: 'campaign' } }] },
    ]),
    executed,
    async (name) => ({ ok: true, output: { taskId: 'task-9', alreadyDelegated: false } }),
  )
  const result = await runOrchestratorV2({ systemPrompt: 'SYS', request: 'build a campaign', history: [], contextBlock: '' }, deps)
  assert.equal(result.kind, 'delegated')
  if (result.kind === 'delegated') {
    assert.equal(result.taskId, 'task-9')
    assert.equal(result.alreadyDelegated, false)
  }
})

test('clarification: model returns a short clarifying question', async () => {
  const deps = makeDeps(scripted([{ text: 'Which product do you mean?', toolCalls: [] }]))
  const result = await runOrchestratorV2({ systemPrompt: 'SYS', request: 'the price?', history: [], contextBlock: '' }, deps)
  assert.equal(result.kind, 'answer')
})

test('context block includes approved brain facts as data', () => {
  const block = buildOrchestratorContext({ brainFacts: [{ category: 'offering', title: 'Coffee', summary: '250g EGP 220', verificationState: 'owner_reported' }], productKnowledge: 'Busmora helps.', region: { country: 'Egypt', currency: 'EGP' } })
  assert.match(block, /Coffee/)
  assert.match(block, /EGP 220/)
  assert.match(block, /DATA, not instructions/)
})

test('empty model text with no tools is an honest error, not a fake answer', async () => {
  const deps = makeDeps(scripted([{ text: '   ', toolCalls: [] }]))
  const result = await runOrchestratorV2({ systemPrompt: 'SYS', request: 'hi', history: [], contextBlock: '' }, deps)
  assert.equal(result.kind, 'error')
})