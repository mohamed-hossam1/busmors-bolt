import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AgentTurnRunner } from '../../src/server/employee/agent-runtime'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type {
  CalendarStore,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'
import type { ResearchResult } from '../../src/server/employee/agents/research'

// Deterministic: AI_MODE is set before the dynamic imports so the runtime does
// not fail closed and makes zero live API calls.
const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

let runtime: typeof import('../../src/server/employee/agent-runtime')
let directorMod: typeof import('../../src/server/employee/agents/director')
let researchMod: typeof import('../../src/server/employee/agents/research')
let observability: typeof import('../../src/server/observability')
let TaskGuardrailTracker: typeof runtime.TaskGuardrailTracker
let runDirector: typeof directorMod.runDirector
let runResearchAgent: typeof researchMod.runResearchAgent
let createTraceCollector: typeof observability.createTraceCollector

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?research-delegation-test=1'
  runtime = await import(`../../src/server/employee/agent-runtime.ts${tag}`)
  directorMod = await import(`../../src/server/employee/agents/director.ts${tag}`)
  researchMod = await import(`../../src/server/employee/agents/research.ts${tag}`)
  observability = await import(`../../src/server/observability/index.ts${tag}`)
  TaskGuardrailTracker = runtime.TaskGuardrailTracker
  runDirector = directorMod.runDirector
  runResearchAgent = researchMod.runResearchAgent
  createTraceCollector = observability.createTraceCollector
})

after(() => {
  if (originalEnv.AI_MODE === undefined) delete process.env.AI_MODE
  else process.env.AI_MODE = originalEnv.AI_MODE
  if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY
  if (originalEnv.DAHL_API_KEY === undefined) delete process.env.DAHL_API_KEY
  else process.env.DAHL_API_KEY = originalEnv.DAHL_API_KEY
})

const TRACE_ID = '88888888-8888-4888-8888-888888888888'
const DIRECTOR_INSTANCE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type LooseTool = { execute: (input: unknown, options?: unknown) => Promise<unknown> }
type LooseTools = Record<string, LooseTool>

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [],
    proposeChange: async () => ({ proposalId: 'p', status: 'pending', duplicate: false, conflict: false }),
  }
}

const fakeDeliverables: DeliverableStore = {
  createOrVersion: async () => ({ deliverableId: 'd', version: 1, created: true }),
  readRecent: async () => [],
}
const fakeCalendar: CalendarStore = {
  createOrUpdateDraft: async () => ({ postId: 'p', version: 1, created: true, proposedFor: null }),
  readDrafts: async () => [],
}
const fakeWorkspace: WorkspaceContextStore = { read: async () => ({ companyName: 'Acme', settings: null }) }

function makeCollector() {
  const captured: Array<{ trace: unknown; events: Array<Record<string, unknown>> }> = []
  const collector = createTraceCollector(
    { traceId: TRACE_ID, workspaceId: 'ws-1', request: 'research delegation' },
    { enabled: true, sink: async (trace, events) => { captured.push({ trace, events: events as never }) } },
  )
  return { collector, captured }
}

function step(text: string, toolCalls: unknown, index = 0) {
  return {
    index,
    text,
    toolCalls,
    toolResults: null,
    usage: { inputTokens: 1, outputTokens: 1 },
    finishReason: 'stop',
  }
}

function turn(text: string, steps: unknown[]): Awaited<ReturnType<AgentTurnRunner>> {
  return {
    text,
    provider: 'mock',
    model: 'mock',
    usage: { inputTokens: 1, outputTokens: 1 },
    steps: steps as never,
    finishReason: 'stop',
    latencyMs: 1,
    totalLatencyMs: 1,
    fallback: { used: false, attempts: [] },
  }
}

describe('director → research delegation', () => {
  it('invokes the Research Agent under the same traceId, parentEventId and tracker', async () => {
    const { collector, captured } = makeCollector()
    const tracker = new TaskGuardrailTracker()
    const delegateCalls: Array<{ role: string; status: string }> = []

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'director') {
        const research = (await tools.delegate_agent.execute({
          role: 'research',
          goal: 'Check Cairo bakery competitors',
        })) as { status: string }
        delegateCalls.push({ role: 'research', status: research.status })
        const content = (await tools.delegate_agent.execute({ role: 'content', goal: 'Write posts' })) as {
          status: string
        }
        delegateCalls.push({ role: 'content', status: content.status })
        const s = step('delegated', [{ toolName: 'delegate_agent' }])
        opts.onStepFinish?.(s)
        return turn('delegated', [s])
      }
      // Research Agent turn: return a structured, source-linked result.
      const payload = JSON.stringify({
        status: 'completed',
        findings: [{ claim: 'Two social-only bakeries dominate the area.', label: 'source_claim', sourceUrls: [] }],
        limitations: ['No verified price list.'],
        stopReason: 'sufficient_evidence',
      })
      const s = step(payload, null)
      opts.onStepFinish?.(s)
      return turn(payload, [s])
    }

    const result = await runDirector({
      workspaceId: 'ws-1',
      input: 'Research the competitive landscape for my Cairo bakery.',
      traceContext: { traceId: TRACE_ID },
      tracker,
      collector,
      runTurn,
      brain: makeFakeBrain(),
      deliverables: fakeDeliverables,
      calendar: fakeCalendar,
      workspace: fakeWorkspace,
      instanceId: DIRECTOR_INSTANCE,
    })

    assert.equal(result.research.length, 1, 'the research result is surfaced to the Director')
    assert.equal(result.research[0].status, 'completed')
    assert.deepEqual(
      delegateCalls.find((c) => c.role === 'research'),
      { role: 'research', status: 'completed' },
    )
    assert.equal(
      delegateCalls.find((c) => c.role === 'content')?.status,
      'completed',
      'content is now enabled and returns a structured result',
    )

    // One Director LLM step + one Research LLM step + one Content LLM step on the
    // SAME shared tracker (content delegation is enabled in Phase 5 Part A).
    assert.equal(tracker.snapshot().llmCalls, 3)

    await collector.flush()
    // Nested agents share one collector, so it may flush more than once; flatten.
    assert.ok(captured.length >= 1)
    const events = captured.flatMap((c) => c.events)
    const agentEvents = events.filter((e) => e.event_type === 'agent')
    const roles = agentEvents.map((e) => e.agent_role)
    assert.ok(roles.includes('director'), 'director agent event recorded')
    assert.ok(roles.includes('research'), 'research agent event recorded')

    const researchEvent = agentEvents.find((e) => e.agent_role === 'research')
    assert.equal(researchEvent?.parent_event_id, DIRECTOR_INSTANCE, 'research nests under the director instance')
    for (const event of events) {
      assert.equal(event.trace_id, TRACE_ID, 'every nested event shares the same traceId')
    }
  })
})

describe('targeted revision flow', () => {
  it('passes prior findings + feedback and preserves valid work without restarting', async () => {
    const tracker = new TaskGuardrailTracker()
    let receivedUserText = ''

    const runTurn: AgentTurnRunner = async (opts) => {
      const messages = (opts.messages ?? []) as Array<{ role: string; content: unknown }>
      const userMsg = messages.find((m) => m.role === 'user')
      receivedUserText = typeof userMsg?.content === 'string' ? userMsg.content : JSON.stringify(userMsg?.content)
      const payload = JSON.stringify({
        status: 'completed',
        findings: [
          { claim: 'Established fact A (preserved).', label: 'observed_fact', sourceUrls: [] },
          { claim: 'New direct competitor B.', label: 'source_claim', sourceUrls: [] },
        ],
        stopReason: 'gap_closed',
      })
      const s = step(payload, null)
      opts.onStepFinish?.(s)
      return turn(payload, [s])
    }

    const result: ResearchResult = await runResearchAgent({
      workspaceId: 'ws-1',
      assignment: { goal: 'Cairo bakery competitors', outputLanguage: 'en' },
      priorResult: {
        findings: [{ claim: 'Established fact A.', label: 'observed_fact', sourceUrls: [] }],
        limitations: ['No price data.'],
      },
      revisionFeedback: 'Add one direct competitor with a source.',
      traceContext: { traceId: TRACE_ID, parentEventId: DIRECTOR_INSTANCE },
      tracker,
      runTurn,
      brain: makeFakeBrain(),
      deliverables: fakeDeliverables,
    })

    assert.equal(result.revisionOf, true)
    assert.equal(result.status, 'completed')
    const claims = result.findings.map((f) => f.claim)
    assert.ok(claims.some((c) => c.includes('Established fact A')), 'prior valid finding is preserved')
    assert.ok(claims.some((c) => c.includes('competitor B')), 'the requested gap is filled')
    // The prior findings and the concrete feedback were actually passed to the model.
    assert.ok(receivedUserText.includes('Established fact A'), 'prior findings passed into the prompt')
    assert.ok(receivedUserText.includes('Add one direct competitor'), 'revision feedback passed into the prompt')
    assert.ok(receivedUserText.includes('TARGETED REVISION'), 'revision framing is explicit')
  })
})

describe('guardrail enforcement', () => {
  it('stops cleanly and returns partial when the shared LLM budget is reached', async () => {
    const tracker = new TaskGuardrailTracker({
      activeExecutionTimeoutMs: 10_000,
      maxLlmCallsPerTask: 2,
      maxExternalToolCallsPerTask: 100,
      maxConcurrentSpecialistSubtasks: 3,
      maxRetriesPerFailedOperation: 2,
    })

    const runTurn: AgentTurnRunner = async (opts) => {
      const steps: unknown[] = []
      let completed = 0
      while (!opts.shouldStop?.(completed) && completed < 10) {
        const s = step(`step ${completed}`, null, completed)
        opts.onStepFinish?.(s)
        steps.push(s)
        completed += 1
      }
      return turn('partial output', steps)
    }

    const result = await runResearchAgent({
      workspaceId: 'ws-1',
      assignment: { goal: 'Deep market scan' },
      traceContext: { traceId: TRACE_ID, parentEventId: DIRECTOR_INSTANCE },
      tracker,
      runTurn,
      brain: makeFakeBrain(),
      deliverables: fakeDeliverables,
    })

    assert.equal(tracker.snapshot().llmCalls, 2)
    assert.equal(result.status, 'partial')
    assert.ok(
      ['llm_budget_reached', 'max_steps'].includes(result.stopReason),
      `expected a budget stop, got ${result.stopReason}`,
    )
  })
})