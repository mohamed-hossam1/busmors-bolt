import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type {
  CalendarStore,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'

// The employee runtime transitively imports ai-models, which fails closed unless
// AI_MODE is set. Set it before the dynamic imports below so these deterministic
// tests make zero live API calls (same pattern as agent-runtime.test.ts).
const originalEnv = { AI_MODE: process.env.AI_MODE, GROQ_API_KEY: process.env.GROQ_API_KEY, DAHL_API_KEY: process.env.DAHL_API_KEY }

let agentRuntime: typeof import('../../src/server/employee/agent-runtime')
let orchestrator: typeof import('../../src/server/employee/agents/orchestrator')
let observability: typeof import('../../src/server/observability')
let TaskGuardrailTracker: typeof agentRuntime.TaskGuardrailTracker
let runOrchestrator: typeof orchestrator.runOrchestrator
let createTraceCollector: typeof observability.createTraceCollector

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?director-handoff-test=1'
  agentRuntime = await import(`../../src/server/employee/agent-runtime.ts${tag}`)
  orchestrator = await import(`../../src/server/employee/agents/orchestrator.ts${tag}`)
  observability = await import(`../../src/server/observability/index.ts${tag}`)
  TaskGuardrailTracker = agentRuntime.TaskGuardrailTracker
  runOrchestrator = orchestrator.runOrchestrator
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

/**
 * Verifies the Orchestrator → Director handoff wiring:
 *   - delegate_to_director actually invokes the Director (not "unavailable"),
 *   - the Director runs under the SAME traceId and the SAME TaskGuardrailTracker,
 *   - nested agent events carry a proper parentEventId hierarchy.
 *
 * A deterministic runTurn stands in for the model: the orchestrator turn calls
 * delegate_to_director; the nested director turn records that it ran and returns.
 * No live API calls are made.
 */

const TRACE_ID = '55555555-5555-4555-8555-555555555555'
const ORCH_INSTANCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

type LooseTool = { execute: (input: unknown, options?: unknown) => Promise<unknown> }
type LooseTools = Record<string, LooseTool>

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

describe('orchestrator → director handoff', () => {
  it('invokes the Director with the shared traceId and TaskGuardrailTracker', async () => {
    const captured: { trace: unknown; events: Array<{ event_type: string; agent_role?: string | null; parent_event_id?: string | null }> }[] = []
    const collector = createTraceCollector(
      { traceId: TRACE_ID, workspaceId: 'ws-1', request: 'handoff' },
      { enabled: true, sink: async (trace, events) => { captured.push({ trace, events: events as never }) } },
    )
    const tracker = new TaskGuardrailTracker()

    let directorRan = false

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'orchestrator') {
        const result = await tools.delegate_to_director.execute(HANDOFF)
        const step = {
          index: 0,
          text: 'handled',
          toolCalls: [{ toolName: 'delegate_to_director' }],
          toolResults: [result],
          usage: { inputTokens: 1, outputTokens: 1 },
          finishReason: 'stop',
        }
        opts.onStepFinish?.(step)
        return {
          text: 'handled',
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
      // Director turn.
      directorRan = true
      const step = {
        index: 0,
        text: 'أهلاً، دي خطة رمضان.',
        toolCalls: null,
        toolResults: null,
        usage: { inputTokens: 1, outputTokens: 1 },
        finishReason: 'stop',
      }
      opts.onStepFinish?.(step)
      return {
        text: 'أهلاً، دي خطة رمضان.',
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

    const result = await runOrchestrator({
      workspaceId: 'ws-1',
      userId: 'user-1',
      messages: [{ role: 'user', content: 'I need a Ramadan campaign.' } as never],
      traceContext: { traceId: TRACE_ID },
      collector,
      tracker,
      runTurn,
      brain: makeFakeBrain(),
      // Provide the full store set so the nested Director needs no supabase.
      deliverables: noopStore,
      calendar: noopCalendar,
      workspace: noopWorkspace,
      instanceId: ORCH_INSTANCE,
    })

    assert.equal(result.status, 'completed')
    assert.ok(directorRan, 'the Director must actually run (not report unavailable)')
    // One orchestrator LLM step + one director LLM step on the SAME tracker.
    assert.equal(tracker.snapshot().llmCalls, 2)

    await collector.flush()
    assert.equal(captured.length, 1)
    const events = captured[0].events
    const agentEvents = events.filter((e) => e.event_type === 'agent')
    const roles = agentEvents.map((e) => e.agent_role)
    assert.ok(roles.includes('orchestrator'), 'orchestrator agent event recorded')
    assert.ok(roles.includes('director'), 'director agent event recorded')

    const directorEvent = agentEvents.find((e) => e.agent_role === 'director')
    assert.equal(directorEvent?.parent_event_id, ORCH_INSTANCE, 'director nests under the orchestrator instance')
  })
})