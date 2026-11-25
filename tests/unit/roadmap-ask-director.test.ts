import assert from 'node:assert/strict'
import { register } from 'node:module'
import { after, before, describe, it } from 'node:test'
import { buildDiscoveryPlan, isAskDirectorEligible } from '../../src/features/roadmap/discovery'
import type { AgentTurnRunner } from '../../src/server/employee/agent-runtime'
import type { TraceCollector } from '../../src/server/observability'

const serverOnlyStub =
  'data:text/javascript,' +
  encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export default {}', shortCircuit: true, format: 'module' }
  }
  return next(specifier, context)
}`)
register(serverOnlyStub)

const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

type AskDirectorModule = typeof import('../../src/server/roadmap/ask-director')
type AgentRuntimeModule = typeof import('../../src/server/employee/agent-runtime')
type ObservabilityModule = typeof import('../../src/server/observability')
type AiModelsModule = typeof import('../../src/config/ai-models')

let askDirector: AskDirectorModule
let agentRuntime: AgentRuntimeModule
let observability: ObservabilityModule
let aiModels: AiModelsModule

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-groq-key'
  process.env.DAHL_API_KEY = process.env.DAHL_API_KEY ?? 'test-dahl-key'
  const tag = '?roadmap-ask-director-test=1'
  askDirector = await import(`../../src/server/roadmap/ask-director.ts${tag}`)
  agentRuntime = await import(`../../src/server/employee/agent-runtime.ts${tag}`)
  observability = await import(`../../src/server/observability/index.ts${tag}`)
  aiModels = await import(`../../src/config/ai-models.ts${tag}`)
})

after(() => {
  if (originalEnv.AI_MODE === undefined) delete process.env.AI_MODE
  else process.env.AI_MODE = originalEnv.AI_MODE
  if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY
  if (originalEnv.DAHL_API_KEY === undefined) delete process.env.DAHL_API_KEY
  else process.env.DAHL_API_KEY = originalEnv.DAHL_API_KEY
})

const baseInput = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  traceId: '22222222-2222-4222-8222-222222222222',
  locale: 'en',
  challenge: { key: 'validate_idea', label: 'Validate My Business Idea' },
  secondaryChallenges: [],
  somethingElseNote: '',
  question: {
    id: '33333333-3333-4333-8333-333333333333',
    key: 'vi_problem',
    label: 'What core problem does your idea solve?',
    options: [
      { value: 'Saves time/effort', label: 'Saves time/effort' },
      { value: 'Reduces cost', label: 'Reduces cost' },
    ],
    currentAnswer: '',
    status: 'unanswered',
  },
  brain: [],
  deliverables: [],
  ownerAnswers: [],
}

function makeRunTurn(output: string, toolsSeen: string[]): AgentTurnRunner {
  return async (options) => {
    toolsSeen.push(...Object.keys(options.tools ?? {}))
    const step = {
      index: 0,
      text: output,
      toolCalls: null,
      toolResults: null,
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: 'stop',
    }
    options.onStepFinish?.(step)
    return {
      text: output,
      provider: 'mock',
      model: 'mock',
      usage: { inputTokens: 1, outputTokens: 1 },
      steps: [step],
      finishReason: 'stop',
      latencyMs: 1,
      totalLatencyMs: 1,
      fallback: { used: false, attempts: [] },
    }
  }
}

function makeCollector(captured: Array<{ trace: unknown; events: unknown[] }>): TraceCollector {
  return observability.createTraceCollector(
    { traceId: baseInput.traceId, workspaceId: baseInput.workspaceId, request: 'roadmap_quick_answer' },
    {
      enabled: true,
      sink: async (trace, events) => {
        captured.push({ trace, events: events as unknown[] })
      },
    },
  )
}

describe('isAskDirectorEligible', () => {
  it('uses the schema flag and falls back to fixed question configuration', () => {
    const plan = buildDiscoveryPlan({ goal: 'validate_idea', hasWebsite: true, facts: [], locale: 'en' })
    const problem = plan.find((item) => item.question_key === 'vi_problem')!
    const spoken = plan.find((item) => item.question_key === 'vi_spoken')!
    assert.equal(isAskDirectorEligible({ question_key: problem.question_key, schema: problem.schema }), true)
    assert.equal(isAskDirectorEligible({ question_key: spoken.question_key, schema: spoken.schema }), false)
    assert.equal(
      isAskDirectorEligible({
        question_key: 'vi_problem',
        schema: { ...problem.schema, askDirectorEligible: undefined },
      }),
      true,
    )
    assert.equal(
      isAskDirectorEligible({
        question_key: 'ci_percent',
        schema: { ...problem.schema, askDirectorEligible: undefined },
      }),
      false,
    )
  })
})

describe('runRoadmapQuickAnswer', () => {
  it('runs in roadmap_quick_answer mode with no subagent or delivery tools', async () => {
    const captured: Array<{ trace: unknown; events: unknown[] }> = []
    const collector = makeCollector(captured)
    const tracker = new agentRuntime.TaskGuardrailTracker(askDirector.ROADMAP_QUICK_ANSWER_BUDGETS)
    const toolsSeen: string[] = []
    const output = JSON.stringify({
      proposedAnswer: 'Saves time/effort.',
      rationale: 'The approved offer is built around saving time.',
      confidence: 'high',
    })

    const result = await askDirector.runRoadmapQuickAnswer(baseInput, {
      collector,
      tracker,
      runTurn: makeRunTurn(output, toolsSeen),
    })

    assert.equal(result.mode, 'roadmap_quick_answer')
    assert.equal(result.error, null)
    assert.equal(aiModels.AI_MODE, 'test')
    assert.equal(result.proposal?.proposedAnswer, 'Saves time/effort.')
    assert.equal(result.proposal?.confidence, 'high')
    assert.equal(toolsSeen.includes('delegate_agent'), false)
    assert.equal(toolsSeen.includes('create_or_version_deliverable'), false)
    assert.equal(toolsSeen.includes('create_or_update_post_draft'), false)
    assert.equal(toolsSeen.includes('propose_brain_change'), false)
    assert.ok(toolsSeen.includes('tavily_search'))
    assert.ok(toolsSeen.includes('exa_search'))
    assert.equal(tracker.budgets.maxLlmCallsPerTask, 3)
    assert.equal(tracker.budgets.maxExternalToolCallsPerTask, 2)

    await collector.flush()
    const events = captured.flatMap((entry) => entry.events) as Array<Record<string, unknown>>
    assert.ok(events.some((event) => event.operation === 'roadmap_quick_answer'))
  })

  it('rejects malformed and multi-paragraph model output', async () => {
    assert.throws(
      () => askDirector.parseRoadmapQuickAnswerResponse('First sentence. Second sentence.'),
      askDirector.RoadmapQuickAnswerValidationError,
    )
    assert.throws(
      () => askDirector.parseRoadmapQuickAnswerResponse('First paragraph.\n\nSecond paragraph.'),
      askDirector.RoadmapQuickAnswerValidationError,
    )
    assert.throws(
      () => askDirector.parseRoadmapQuickAnswerResponse('not json'),
      askDirector.RoadmapQuickAnswerValidationError,
    )
  })

  it('returns an error result instead of throwing on malformed output', async () => {
    const captured: Array<{ trace: unknown; events: unknown[] }> = []
    const collector = makeCollector(captured)
    const toolsSeen: string[] = []
    const result = await askDirector.runRoadmapQuickAnswer(baseInput, {
      collector,
      runTurn: makeRunTurn('First sentence. Second sentence.', toolsSeen),
    })
    assert.equal(result.proposal, null)
    assert.match(result.error ?? '', /valid|validation/i)
  })

  it('handles quota exhaustion cleanly without losing caller state', async () => {
    const captured: Array<{ trace: unknown; events: unknown[] }> = []
    const collector = makeCollector(captured)
    const tracker = new agentRuntime.TaskGuardrailTracker({
      ...askDirector.ROADMAP_QUICK_ANSWER_BUDGETS,
      maxLlmCallsPerTask: 0,
    })
    let called = false
    const result = await askDirector.runRoadmapQuickAnswer(baseInput, {
      collector,
      tracker,
      runTurn: async (options) => {
        called = true
        return makeRunTurn('unused', [])(options)
      },
    })
    assert.equal(called, false)
    assert.equal(result.proposal, null)
    assert.match(result.error ?? '', /budget_llm/)
  })
})