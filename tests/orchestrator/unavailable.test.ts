import test from 'node:test'
import assert from 'node:assert/strict'
import { runOrchestrator, type OrchestratorDeps } from '../../src/features/orchestrator/gateway.ts'
import { capabilityUnavailableReply } from '../../src/features/orchestrator/prompt.ts'

function makeDeps(decide: OrchestratorDeps['decide']) {
  const calls: string[] = []
  const deps: OrchestratorDeps = {
    guard: () => ({ action: 'allow', reason: '', message: '', hint: null, injection: false }),
    greet: () => null,
    decide,
    retrieveBrain: async () => {
      calls.push('brain')
      return { ok: false, query: '', facts: [], retrievedCount: 0, elapsedMs: 0 }
    },
    answerFromBrain: async () => {
      calls.push('brain_answer')
      return { reply: '', modelCalls: 1 }
    },
    findPriorRun: async () => null,
    recordEvent: async () => {},
    recordUserMessage: async (_content, payload) => { calls.push(`user:${JSON.stringify(payload)}`) },
    recordAgentMessage: async (content) => { calls.push(`agent:${content}`); return 'message-1' },
    recordRun: async (record) => { calls.push(`run:${record.outcome}`) },
  }
  return { deps, calls }
}

const taskDecision: OrchestratorDeps['decide'] = async () => ({
  decision: { path: 'task', reply: '', brainQuery: '', intent: 'content_creation', quantity: 2 },
  modelCalls: 1,
})

test('task requests return an honest unavailability reply and never enqueue', async () => {
  const { deps, calls } = makeDeps(taskDecision)
  const result = await runOrchestrator(
    { conversationId: 'c1', request: 'Write two posts', idempotencyKey: 'k1', history: [], region: {} },
    deps,
  )

  assert.equal(result.outcome, 'direct')
  assert.equal(result.path, 'direct')
  assert.equal(result.taskId, null)
  assert.match(result.reply, /temporarily unavailable/i)
  assert.equal(calls.includes('brain'), false)
  assert.equal(calls.includes('brain_answer'), false)
  assert.ok(calls.some((call) => call.startsWith('run:direct')))
  assert.ok(calls.some((call) => call.startsWith('user:') && call.includes('"unavailable":true')))
  assert.ok(calls.some((call) => call.startsWith('agent:') && /temporarily unavailable/i.test(call)))
})

test('Arabic task requests get an Arabic unavailability reply', async () => {
  const { deps } = makeDeps(taskDecision)
  const result = await runOrchestrator(
    { conversationId: 'c1', request: 'اكتب بوستين', idempotencyKey: 'k2', history: [], region: {} },
    deps,
  )
  assert.equal(result.outcome, 'direct')
  assert.match(result.reply, /غير متاحة مؤقتًا/)
})

test('capabilityUnavailableReply selects language from the request', () => {
  assert.match(capabilityUnavailableReply('hello'), /temporarily unavailable/i)
  assert.match(capabilityUnavailableReply('مرحبا'), /غير متاحة مؤقتًا/)
})