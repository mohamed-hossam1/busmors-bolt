import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type { DirectorOutput } from '../../src/server/employee/agents/director'
import type {
  CalendarStore,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'
import type {
  HeavyTaskGate,
  HeavyTaskReleaseReason,
} from '../../src/server/quota/heavy-tasks'

// The employee runtime transitively imports ai-models, which fails closed unless
// AI_MODE is set. Set it before the dynamic imports below so these deterministic
// tests make zero live API calls (same pattern as director-handoff.test.ts).
const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

let agentRuntime: typeof import('../../src/server/employee/agent-runtime')
let orchestrator: typeof import('../../src/server/employee/agents/orchestrator')
let heavyTasks: typeof import('../../src/server/quota/heavy-tasks')
let observability: typeof import('../../src/server/observability')
let TaskGuardrailTracker: typeof agentRuntime.TaskGuardrailTracker
let runOrchestrator: typeof orchestrator.runOrchestrator
let classifyDirectorOutcome: typeof heavyTasks.classifyDirectorOutcome
let createTraceCollector: typeof observability.createTraceCollector

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?heavy-task-quota-test=1'
  agentRuntime = await import(`../../src/server/employee/agent-runtime.ts${tag}`)
  orchestrator = await import(`../../src/server/employee/agents/orchestrator.ts${tag}`)
  heavyTasks = await import(`../../src/server/quota/heavy-tasks.ts${tag}`)
  observability = await import(`../../src/server/observability/index.ts${tag}`)
  TaskGuardrailTracker = agentRuntime.TaskGuardrailTracker
  runOrchestrator = orchestrator.runOrchestrator
  classifyDirectorOutcome = heavyTasks.classifyDirectorOutcome
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

type AgentTurnRunner = import('../../src/server/employee/agent-runtime').AgentTurnRunner

const TRACE_ID = '66666666-6666-4666-8666-666666666666'
const ORCH_INSTANCE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type LooseTool = { execute: (input: unknown, options?: unknown) => Promise<unknown> }
type LooseTools = Record<string, LooseTool>
type LooseStep = {
  index: number
  text: string
  toolCalls: unknown
  toolResults: unknown
  usage: { inputTokens: number; outputTokens: number }
  finishReason: string
}
type LooseTurnOpts = {
  role: string
  tools?: LooseTools
  onStepFinish?: (step: LooseStep) => void
}

/** Build a deterministic AgentTurnResult and fire onStepFinish (records the LLM call). */
function finish(opts: LooseTurnOpts, text: string, toolCalls: unknown, toolResults: unknown) {
  const step: LooseStep = {
    index: 0,
    text,
    toolCalls,
    toolResults,
    usage: { inputTokens: 1, outputTokens: 1 },
    finishReason: 'stop',
  }
  opts.onStepFinish?.(step)
  return {
    text,
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

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [],
    proposeChange: async () => ({ proposalId: 'p', status: 'pending', duplicate: false, conflict: false }),
  }
}

const noopStore = {
  createOrVersion: async () => ({ deliverableId: 'd', version: 1, created: true }),
  readRecent: async () => [],
} as unknown as DeliverableStore
const noopCalendar = {
  createOrUpdateDraft: async () => ({ postId: 'p', version: 1, created: true, proposedFor: null }),
  readDrafts: async () => [],
} as unknown as CalendarStore
const noopWorkspace: WorkspaceContextStore = { read: async () => ({ companyName: null, settings: null }) }

const HANDOFF = {
  originalRequest: 'Write a Ramadan campaign for my bakery.',
  intendedOutcome: 'A 3-post campaign plan with captions.',
  outputLanguage: 'ar',
  context: 'Audience is families in Cairo.',
}

const CLARIFICATION = {
  questions: [
    {
      id: 'q1',
      question: 'Which city?',
      type: 'single' as const,
      options: ['Cairo', 'Alexandria'],
      allowCustom: true,
      notSure: true,
    },
  ],
}

const DELIVERABLE_INPUT = {
  title: 'Ramadan Campaign Plan',
  type: 'general' as const,
  content: 'A detailed 3-post Ramadan campaign plan for the bakery.',
}

interface FakeGateState {
  remaining: number
  reserveCalls: number
  settleCalls: number
  releaseCalls: HeavyTaskReleaseReason[]
}

/**
 * In-memory HeavyTaskGate with counters. `remaining` is mutable so settle can
 * decrement it and tests can assert the observed snapshot. No live API calls.
 */
function makeFakeGate(initialRemaining: number): { gate: HeavyTaskGate; state: FakeGateState } {
  const state: FakeGateState = {
    remaining: initialRemaining,
    reserveCalls: 0,
    settleCalls: 0,
    releaseCalls: [],
  }
  const snapshot = () => ({
    activated: true,
    limit: 6,
    used: 6 - state.remaining,
    reserved: 0,
    remaining: state.remaining,
  })
  const gate: HeavyTaskGate = {
    getQuota: async () => snapshot(),
    reserve: async () => {
      state.reserveCalls += 1
      if (state.remaining <= 0) {
        return {
          allowed: false,
          reason: 'QUOTA_EXHAUSTED',
          quota: { activated: true, limit: 6, used: 6, reserved: 0, remaining: 0 },
        }
      }
      return { allowed: true, runId: 'run-1', quota: snapshot() }
    },
    settle: async () => {
      state.settleCalls += 1
      state.remaining = Math.max(0, state.remaining - 1)
      return snapshot()
    },
    release: async (_runId: string, reason: HeavyTaskReleaseReason) => {
      state.releaseCalls.push(reason)
      return snapshot()
    },
  }
  return { gate, state }
}

function makeResult(overrides: Partial<DirectorOutput>): DirectorOutput {
  return {
    text: '',
    status: 'completed',
    stopReason: 'finished',
    loadedSkills: [],
    usedTools: [],
    clarification: null,
    deliverables: [],
    drafts: [],
    brainProposals: [],
    research: [],
    content: [],
    ...overrides,
  }
}

describe('classifyDirectorOutcome', () => {
  it('consumes when a deliverable was persisted', () => {
    const decision = classifyDirectorOutcome(
      makeResult({ deliverables: [{ deliverableId: 'd', version: 1, created: true, title: 'T' }] }),
    )
    assert.equal(decision, 'consume')
  })

  it('consumes when a calendar draft was saved', () => {
    const decision = classifyDirectorOutcome(
      makeResult({ drafts: [{ postId: 'p', version: 1, created: true, proposedFor: null }] }),
    )
    assert.equal(decision, 'consume')
  })

  it('consumes when a brain proposal was created', () => {
    const decision = classifyDirectorOutcome(
      makeResult({ brainProposals: [{ proposalId: 'p', status: 'pending', duplicate: false, conflict: false }] }),
    )
    assert.equal(decision, 'consume')
  })

  it('consumes a completed turn with real prose and no clarification', () => {
    const decision = classifyDirectorOutcome(makeResult({ text: 'Here is your plan.' }))
    assert.equal(decision, 'consume')
  })

  it('releases a clarification with no artifacts', () => {
    const decision = classifyDirectorOutcome(makeResult({ clarification: CLARIFICATION }))
    assert.equal(decision, 'released_clarification')
  })

  it('releases a partial/empty turn as failed', () => {
    const decision = classifyDirectorOutcome(makeResult({ status: 'partial', stopReason: 'error' }))
    assert.equal(decision, 'released_failed')
  })

  it('releases a quota-exhausted stub as failed (never settles)', () => {
    const decision = classifyDirectorOutcome(makeResult({ quotaExhausted: true, text: 'stub' }))
    assert.equal(decision, 'released_failed')
  })

  it('consumes when a clarification AND a deliverable are both present', () => {
    const decision = classifyDirectorOutcome(
      makeResult({
        clarification: CLARIFICATION,
        deliverables: [{ deliverableId: 'd', version: 1, created: true, title: 'T' }],
      }),
    )
    assert.equal(decision, 'consume')
  })
})

describe('runOrchestrator heavy-task quota gate', () => {
  it('does not reserve for a direct read_business_brain answer', async () => {
    const { gate, state } = makeFakeGate(6)
    let directorRan = false

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'orchestrator') {
        const result = await tools.read_business_brain.execute({})
        return finish(opts as unknown as LooseTurnOpts, 'Here is what I know.', [{ toolName: 'read_business_brain' }], [result])
      }
      directorRan = true
      return finish(opts as unknown as LooseTurnOpts, 'unexpected', null, null)
    }

    const result = await runOrchestrator({
      workspaceId: 'ws-1',
      userId: 'user-1',
      messages: [{ role: 'user', content: 'What do you know about my business?' } as never],
      traceContext: { traceId: TRACE_ID },
      runTurn,
      brain: makeFakeBrain(),
      deliverables: noopStore,
      calendar: noopCalendar,
      workspace: noopWorkspace,
      instanceId: ORCH_INSTANCE,
      heavyTaskGate: gate,
      heavyTasksRemaining: 6,
    })

    assert.equal(directorRan, false)
    assert.equal(state.reserveCalls, 0)
    assert.equal(state.settleCalls, 0)
    assert.equal(state.releaseCalls.length, 0)
    assert.equal(result.structured.quotaExhausted, false)
    assert.equal(result.status, 'completed')
  })

  it('releases (released_clarification) when the Director asks a clarification', async () => {
    const { gate, state } = makeFakeGate(6)

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'orchestrator') {
        const result = await tools.delegate_to_director.execute(HANDOFF)
        return finish(opts as unknown as LooseTurnOpts, 'handled', [{ toolName: 'delegate_to_director' }], [result])
      }
      // Director turn: ask a clarification, produce no prose/artifacts.
      const result = await tools.ask_clarification.execute(CLARIFICATION)
      return finish(opts as unknown as LooseTurnOpts, '', [{ toolName: 'ask_clarification' }], [result])
    }

    const result = await runOrchestrator({
      workspaceId: 'ws-1',
      userId: 'user-1',
      messages: [{ role: 'user', content: 'I need a Ramadan campaign.' } as never],
      traceContext: { traceId: TRACE_ID },
      runTurn,
      brain: makeFakeBrain(),
      deliverables: noopStore,
      calendar: noopCalendar,
      workspace: noopWorkspace,
      instanceId: ORCH_INSTANCE,
      heavyTaskGate: gate,
      heavyTasksRemaining: 6,
    })

    assert.equal(state.reserveCalls, 1)
    assert.equal(state.settleCalls, 0)
    assert.deepEqual(state.releaseCalls, ['released_clarification'])
    assert.equal(state.remaining, 6, 'a released clarification must not consume quota')
    assert.ok(result.structured.clarification, 'the clarification card is surfaced')
    assert.equal(result.structured.quotaExhausted, false)
  })

  it('settles (consumes) when the Director produces a deliverable', async () => {
    const { gate, state } = makeFakeGate(6)

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'orchestrator') {
        const result = await tools.delegate_to_director.execute(HANDOFF)
        return finish(opts as unknown as LooseTurnOpts, 'handled', [{ toolName: 'delegate_to_director' }], [result])
      }
      // Director turn: persist a deliverable, then reply.
      const result = await tools.create_or_version_deliverable.execute(DELIVERABLE_INPUT)
      return finish(opts as unknown as LooseTurnOpts, 'Done, saved to outputs.', [{ toolName: 'create_or_version_deliverable' }], [result])
    }

    const result = await runOrchestrator({
      workspaceId: 'ws-1',
      userId: 'user-1',
      messages: [{ role: 'user', content: 'Write a full strategy report.' } as never],
      traceContext: { traceId: TRACE_ID },
      runTurn,
      brain: makeFakeBrain(),
      deliverables: noopStore,
      calendar: noopCalendar,
      workspace: noopWorkspace,
      instanceId: ORCH_INSTANCE,
      heavyTaskGate: gate,
      heavyTasksRemaining: 6,
    })

    assert.equal(state.reserveCalls, 1)
    assert.equal(state.settleCalls, 1)
    assert.equal(state.releaseCalls.length, 0)
    assert.equal(state.remaining, 5, 'a consumed task decrements remaining by 1')
    assert.equal(result.structured.deliverables.length, 1)
    assert.equal(result.structured.quotaExhausted, false)
  })

  it('releases (released_failed) and flags directorFailed when the Director errors', async () => {
    const { gate, state } = makeFakeGate(6)

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'orchestrator') {
        const result = await tools.delegate_to_director.execute(HANDOFF)
        return finish(opts as unknown as LooseTurnOpts, 'handled', [{ toolName: 'delegate_to_director' }], [result])
      }
      // Director turn throws; runAgent converts this to a partial/error result.
      throw new Error('rate limit')
    }

    const result = await runOrchestrator({
      workspaceId: 'ws-1',
      userId: 'user-1',
      messages: [{ role: 'user', content: 'اعمل خطة' } as never],
      traceContext: { traceId: TRACE_ID },
      runTurn,
      brain: makeFakeBrain(),
      deliverables: noopStore,
      calendar: noopCalendar,
      workspace: noopWorkspace,
      instanceId: ORCH_INSTANCE,
      heavyTaskGate: gate,
      heavyTasksRemaining: 6,
    })

    assert.equal(state.reserveCalls, 1)
    assert.equal(state.settleCalls, 0)
    assert.deepEqual(state.releaseCalls, ['released_failed'])
    assert.equal(state.remaining, 6, 'a failed task must not consume quota')
    assert.equal(result.structured.directorFailed, true)
    assert.equal(result.structured.quotaExhausted, false)
  })

  it('does not run the Director when remaining is 0, and still answers direct questions', async () => {
    const { gate, state } = makeFakeGate(0)
    let directorTurnCount = 0

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'orchestrator') {
        const result = await tools.delegate_to_director.execute(HANDOFF)
        return finish(opts as unknown as LooseTurnOpts, 'handled', [{ toolName: 'delegate_to_director' }], [result])
      }
      directorTurnCount += 1
      return finish(opts as unknown as LooseTurnOpts, 'should not run', null, null)
    }

    const result = await runOrchestrator({
      workspaceId: 'ws-1',
      userId: 'user-1',
      messages: [{ role: 'user', content: 'I need a campaign.' } as never],
      traceContext: { traceId: TRACE_ID },
      runTurn,
      brain: makeFakeBrain(),
      deliverables: noopStore,
      calendar: noopCalendar,
      workspace: noopWorkspace,
      instanceId: ORCH_INSTANCE,
      heavyTaskGate: gate,
      heavyTasksRemaining: 0,
    })

    assert.equal(directorTurnCount, 0, 'the Director must not run when the quota is exhausted')
    assert.equal(state.reserveCalls, 1)
    assert.equal(state.settleCalls, 0)
    assert.equal(result.structured.quotaExhausted, true)
    assert.ok(!result.structured.directorFailed, 'quota exhaustion is not a Director failure')

    // A direct Business Brain question still succeeds at 0 remaining (no reserve).
    const directRun: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      const answer = await tools.read_business_brain.execute({})
      return finish(opts as unknown as LooseTurnOpts, 'Here is what I know.', [{ toolName: 'read_business_brain' }], [answer])
    }
    const directResult = await runOrchestrator({
      workspaceId: 'ws-1',
      userId: 'user-1',
      messages: [{ role: 'user', content: 'What do you know about my business?' } as never],
      traceContext: { traceId: TRACE_ID },
      runTurn: directRun,
      brain: makeFakeBrain(),
      deliverables: noopStore,
      calendar: noopCalendar,
      workspace: noopWorkspace,
      instanceId: ORCH_INSTANCE,
      heavyTaskGate: gate,
      heavyTasksRemaining: 0,
    })

    assert.equal(directResult.status, 'completed')
    assert.equal(directResult.structured.quotaExhausted, false)
    assert.equal(state.reserveCalls, 1, 'the direct answer must not reserve a slot')
  })
})