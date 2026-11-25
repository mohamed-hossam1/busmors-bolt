import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ModelMessage } from 'ai'
import { AI_MODE } from '../../src/config/ai-models'
import { runOrchestrator } from '../../src/server/employee/agents/orchestrator'
import { TaskGuardrailTracker } from '../../src/server/employee/agent-runtime'
import type { BrainStore } from '../../src/server/employee/brain-store'

/**
 * Live Orchestrator smoke tests.
 *
 * These run against the real configured model and therefore respect the active
 * AI_MODE from the environment (no hardcoded mode override): the same command
 * works in test and production. The Brain store is a deterministic in-memory
 * fake so the tests need no database and never mutate real data.
 */

const TRACE_ID = '33333333-3333-4333-8333-333333333333'
const ARABIC_RE = /[\u0600-\u06FF]/

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [
      {
        id: 'node-1',
        category: 'company_profile',
        title: 'Acme Bakery',
        summary: 'A neighborhood bakery in Cairo selling bread and pastries.',
        properties: {},
        version: 2,
        source: 'manual',
        sourceDetail: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    proposeChange: async () => ({
      proposalId: 'proposal-1',
      status: 'pending',
      duplicate: false,
      conflict: false,
      baseVersion: 2,
    }),
  }
}

async function run(text: string, history: ModelMessage[] = []) {
  const tracker = new TaskGuardrailTracker()
  const messages: ModelMessage[] = [...history, { role: 'user', content: text } as ModelMessage]
  const result = await runOrchestrator({
    workspaceId: 'ws-live',
    userId: 'user-live',
    messages,
    traceContext: { traceId: TRACE_ID },
    tracker,
    brain: makeFakeBrain(),
  })
  return { result, tracker }
}

describe(`live orchestrator smoke tests (AI_MODE=${AI_MODE})`, () => {
  it('answers an Egyptian Arabic greeting in one model call with no tools', { timeout: 180_000 }, async () => {
    const { result, tracker } = await run('السلام عليكم، إزيك؟')
    console.log('[smoke] ar greeting', JSON.stringify({ usedTools: result.usedTools, llmCalls: tracker.snapshot().llmCalls }))
    assert.equal(result.status, 'completed')
    assert.equal(result.usedTools.length, 0)
    assert.equal(tracker.snapshot().llmCalls, 1)
    assert.ok(ARABIC_RE.test(result.output), 'reply should be in Arabic script')
  })

  it('answers an English question in English with no tools', { timeout: 180_000 }, async () => {
    const { result, tracker } = await run('Hello, what can Busmora do for me?')
    console.log('[smoke] en question', JSON.stringify({ usedTools: result.usedTools, llmCalls: tracker.snapshot().llmCalls }))
    assert.equal(result.status, 'completed')
    assert.equal(result.usedTools.length, 0)
    assert.equal(tracker.snapshot().llmCalls, 1)
    assert.equal(ARABIC_RE.test(result.output), false, 'English query should not be answered in Arabic')
  })

  it('reads approved Business Brain for a business question', { timeout: 180_000 }, async () => {
    const { result } = await run('What do you know about my business?')
    console.log('[smoke] brain read', JSON.stringify({ usedTools: result.usedTools, status: result.status }))
    assert.ok(
      result.usedTools.includes('read_business_brain'),
      'expected read_business_brain to be used',
    )
  })

  it('proposes a pending Brain change when asked to update a fact (never auto-applies)', { timeout: 180_000 }, async () => {
    const { result } = await run('Update my bakery phone number to 01012345678.')
    console.log('[smoke] brain propose', JSON.stringify({ usedTools: result.usedTools }))
    assert.ok(
      result.usedTools.includes('propose_brain_change'),
      'expected propose_brain_change to be used',
    )
    assert.ok(
      /pending|approval|proposal|changed|updated|موافقة|اعتماد|اقتراح|تعديل|بطاقة|تم/i.test(result.output),
      'reply should indicate a pending proposal/approval was created',
    )
  })

  it('delegates a marketing strategy request to the Director and reports unavailability honestly', { timeout: 180_000 }, async () => {
    const { result } = await run('I need a full marketing strategy and Ramadan campaign plan for my bakery.')
    console.log('[smoke] delegate', JSON.stringify({ usedTools: result.usedTools }))
    assert.ok(
      result.usedTools.includes('delegate_to_director'),
      'expected delegate_to_director to be used',
    )
    assert.ok(
      /director|not enabled|unavailable|unavailable soon|مشغّل|غير متاح|المدير/i.test(result.output),
      'reply should honestly report the Director is not enabled yet',
    )
  })
})