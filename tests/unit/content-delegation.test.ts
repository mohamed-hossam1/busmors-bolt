import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AgentTurnRunner } from '../../src/server/employee/agent-runtime'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type {
  CalendarStore,
  CreateOrUpdatePostDraftInput,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'
import type { ContentResult } from '../../src/server/employee/agents/content'
import { projectTraceEvents } from '../../src/server/employee/trace-projection'

// Deterministic: AI_MODE is set before the dynamic imports so the runtime does
// not fail closed and makes zero live API calls.
const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

let runtime: typeof import('../../src/server/employee/agent-runtime')
let directorMod: typeof import('../../src/server/employee/agents/director')
let contentMod: typeof import('../../src/server/employee/agents/content')
let observability: typeof import('../../src/server/observability')
let TaskGuardrailTracker: typeof runtime.TaskGuardrailTracker
let runDirector: typeof directorMod.runDirector
let runContentAgent: typeof contentMod.runContentAgent
let CONTENT_SYSTEM_PROMPT: typeof contentMod.CONTENT_SYSTEM_PROMPT
let createTraceCollector: typeof observability.createTraceCollector

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?content-delegation-test=1'
  runtime = await import(`../../src/server/employee/agent-runtime.ts${tag}`)
  directorMod = await import(`../../src/server/employee/agents/director.ts${tag}`)
  contentMod = await import(`../../src/server/employee/agents/content.ts${tag}`)
  observability = await import(`../../src/server/observability/index.ts${tag}`)
  TaskGuardrailTracker = runtime.TaskGuardrailTracker
  runDirector = directorMod.runDirector
  runContentAgent = contentMod.runContentAgent
  CONTENT_SYSTEM_PROMPT = contentMod.CONTENT_SYSTEM_PROMPT
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

const TRACE_ID = '99999999-9999-4999-8999-999999999999'
const DIRECTOR_INSTANCE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type LooseTool = { execute: (input: unknown, options?: unknown) => Promise<unknown> }
type LooseTools = Record<string, LooseTool>

interface FakePostRow {
  id: string
  platform: string
  caption: string
  status: string
  scheduled_for: string | null
  proposed_for: string | null
}

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

function makeFakeCalendar() {
  const rows: FakePostRow[] = []
  let seq = 0
  const store: CalendarStore = {
    async createOrUpdateDraft(input: CreateOrUpdatePostDraftInput) {
      seq += 1
      const row: FakePostRow = {
        id: `post-${seq}`,
        platform: input.platform,
        caption: input.caption,
        status: 'draft',
        scheduled_for: null, // a draft is NEVER scheduled
        proposed_for: input.proposedFor ?? null,
      }
      rows.push(row)
      return { postId: row.id, version: 1, created: true, proposedFor: row.proposed_for }
    },
    readDrafts: async () => [],
  }
  return { store, rows }
}

const fakeWorkspace: WorkspaceContextStore = { read: async () => ({ companyName: 'Acme', settings: null }) }

function makeCollector() {
  const captured: Array<{ trace: unknown; events: Array<Record<string, unknown>> }> = []
  const collector = createTraceCollector(
    { traceId: TRACE_ID, workspaceId: 'ws-1', request: 'content delegation' },
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

describe('runContentAgent prompt composition', () => {
  it('uses the canonical CONTENT_SYSTEM_PROMPT plus the COMPACT catalog, never full skill bodies', async () => {
    const tracker = new TaskGuardrailTracker()
    let receivedSystem = ''
    let receivedUserText = ''

    const runTurn: AgentTurnRunner = async (opts) => {
      receivedSystem = opts.system
      const messages = (opts.messages ?? []) as Array<{ role: string; content: unknown }>
      const userMsg = messages.find((m) => m.role === 'user')
      receivedUserText = typeof userMsg?.content === 'string' ? userMsg.content : JSON.stringify(userMsg?.content)
      const payload = JSON.stringify({
        status: 'completed',
        drafts: [
          {
            id: 'post-1',
            itemType: 'post_draft',
            platform: 'instagram',
            title: 'Ramadan',
            body: 'استعد لرمضان معنا',
            readiness: 'draft_ready',
          },
        ],
        stopReason: 'assigned_output_complete',
      })
      const s = step(payload, null)
      opts.onStepFinish?.(s)
      return turn(payload, [s])
    }

    const result: ContentResult = await runContentAgent({
      workspaceId: 'ws-1',
      assignment: { goal: 'Write one Ramadan Instagram post', outputLanguage: 'ar-EG' },
      traceContext: { traceId: TRACE_ID, parentEventId: DIRECTOR_INSTANCE },
      tracker,
      runTurn,
      brain: makeFakeBrain(),
      deliverables: fakeDeliverables,
      calendar: makeFakeCalendar().store,
    })

    // The canonical prompt is injected verbatim as the leading content.
    assert.ok(
      receivedSystem.startsWith(CONTENT_SYSTEM_PROMPT),
      'system prompt begins with the canonical Content Agent V1 prompt',
    )
    assert.match(receivedSystem, /You are Busmora's Content Agent/)
    // The COMPACT catalog is appended (id + version + description) ...
    assert.match(receivedSystem, /- social-media-content \(v1\.0\.0\):/)
    // ... but NO full skill body is concatenated.
    assert.equal(receivedSystem.includes('## Creative method'), false, 'skill bodies must not be concatenated')
    assert.equal(receivedSystem.includes('## Purpose'), false, 'skill bodies must not be concatenated')

    // The delegated goal reaches the model task input.
    assert.ok(receivedUserText.includes('Write one Ramadan Instagram post'))

    assert.equal(result.status, 'completed')
    assert.equal(result.drafts.length, 1)
    assert.equal(result.drafts[0].platform, 'instagram')
    assert.equal(result.drafts[0].readiness, 'draft_ready')
  })
})

describe('targeted content revision', () => {
  it('passes prior drafts + feedback and preserves valid drafts without restarting', async () => {
    const tracker = new TaskGuardrailTracker()
    let receivedUserText = ''

    const runTurn: AgentTurnRunner = async (opts) => {
      const messages = (opts.messages ?? []) as Array<{ role: string; content: unknown }>
      const userMsg = messages.find((m) => m.role === 'user')
      receivedUserText = typeof userMsg?.content === 'string' ? userMsg.content : JSON.stringify(userMsg?.content)
      const payload = JSON.stringify({
        status: 'completed',
        drafts: [
          {
            id: 'post-1',
            itemType: 'post_draft',
            platform: 'facebook',
            title: 'Ramadan (preserved)',
            body: 'العرض الأصلي كما هو',
            readiness: 'draft_ready',
          },
          {
            id: 'post-2',
            itemType: 'post_draft',
            platform: 'facebook',
            title: 'Ramadan (fixed CTA)',
            body: 'عرض رمضان — اطلب الآن',
            cta: 'اطلب الآن عبر واتساب',
            readiness: 'draft_ready',
          },
        ],
        stopReason: 'gap_closed',
      })
      const s = step(payload, null)
      opts.onStepFinish?.(s)
      return turn(payload, [s])
    }

    const result: ContentResult = await runContentAgent({
      workspaceId: 'ws-1',
      assignment: { goal: 'Ramadan posts', outputLanguage: 'ar-EG' },
      priorResult: {
        drafts: [
          {
            id: 'post-1',
            itemType: 'post_draft',
            platform: 'facebook',
            title: 'Ramadan (preserved)',
            body: 'العرض الأصلي كما هو',
            readiness: 'draft_ready',
            sourceRefs: [],
          },
        ],
        limitations: ['No promo code yet.'],
      },
      revisionFeedback: 'Make the call to action concrete on the second post only.',
      traceContext: { traceId: TRACE_ID, parentEventId: DIRECTOR_INSTANCE },
      tracker,
      runTurn,
      brain: makeFakeBrain(),
      deliverables: fakeDeliverables,
      calendar: makeFakeCalendar().store,
    })

    assert.equal(result.revisionOf, true)
    assert.equal(result.status, 'completed')
    // Prior valid draft is preserved by the model and surfaced unchanged.
    const preserved = result.drafts.find((d) => d.id === 'post-1')
    assert.ok(preserved, 'prior valid draft is preserved')
    assert.equal(preserved?.body, 'العرض الأصلي كما هو')
    // The requested defect was addressed on the targeted post.
    const fixed = result.drafts.find((d) => d.id === 'post-2')
    assert.equal(fixed?.cta, 'اطلب الآن عبر واتساب')

    // Prior drafts, concrete feedback and the revision framing reached the model.
    assert.ok(receivedUserText.includes('TARGETED REVISION'), 'revision framing is explicit')
    assert.ok(receivedUserText.includes('العرض الأصلي كما هو'), 'prior drafts passed into the prompt')
    assert.ok(receivedUserText.includes('Make the call to action concrete'), 'revision feedback passed into the prompt')
  })
})

describe('director → content delegation', () => {
  it('shares traceId, parentEventId (Director instance) and tracker; enriches drafts; never auto-schedules', async () => {
    const { collector, captured } = makeCollector()
    const tracker = new TaskGuardrailTracker()
    const calendar = makeFakeCalendar()
    const delegateCalls: Array<{ role: string; status: string }> = []

    const runTurn: AgentTurnRunner = async (opts) => {
      const tools = (opts.tools ?? {}) as LooseTools
      if (opts.role === 'director') {
        const content = (await tools.delegate_agent.execute({
          role: 'content',
          goal: 'Write two Ramadan posts for Facebook',
        })) as { status: string }
        delegateCalls.push({ role: 'content', status: content.status })

        const analyst = (await tools.delegate_agent.execute({
          role: 'marketing-analyst',
          goal: 'Analyze performance',
        })) as { status: string }
        delegateCalls.push({ role: 'marketing-analyst', status: analyst.status })

        // The Director persists one of the returned drafts as a Calendar draft.
        await tools.create_or_update_post_draft.execute({
          platform: 'facebook',
          caption: 'عرض رمضان ٢٠٪',
          hashtags: '#رمضان #عرض',
          visualBrief: 'Flat-lay of iftar items, warm lighting.',
          proposedFor: '2026-03-01T18:00:00+02:00',
        })

        const s = step('delegated', [{ toolName: 'delegate_agent' }, { toolName: 'create_or_update_post_draft' }])
        opts.onStepFinish?.(s)
        return turn('delegated', [s])
      }

      // Content Agent turn: read a skill + the calendar, then return drafts.
      await tools.read_skill.execute({ skillId: 'social-media-content' })
      await tools.read_calendar.execute({ limit: 5 })
      const payload = JSON.stringify({
        status: 'completed',
        drafts: [
          {
            id: 'post-1',
            itemType: 'post_draft',
            platform: 'facebook',
            title: 'Ramadan post 1',
            body: 'عرض رمضان ٢٠٪',
            readiness: 'draft_ready',
            proposedTime: '2026-03-01T18:00:00+02:00',
          },
        ],
        notes: ['Ready for Director review.'],
        stopReason: 'assigned_output_complete',
      })
      const s = step(payload, [{ toolName: 'read_skill' }, { toolName: 'read_calendar' }])
      opts.onStepFinish?.(s)
      return turn(payload, [s])
    }

    const result = await runDirector({
      workspaceId: 'ws-1',
      input: 'Create Ramadan Facebook posts and save one as a draft.',
      traceContext: { traceId: TRACE_ID },
      tracker,
      collector,
      runTurn,
      brain: makeFakeBrain(),
      deliverables: fakeDeliverables,
      calendar: calendar.store,
      workspace: fakeWorkspace,
      instanceId: DIRECTOR_INSTANCE,
    })

    // Content result surfaced to the Director.
    assert.equal(result.content.length, 1)
    assert.equal(result.content[0].status, 'completed')
    assert.equal(result.content[0].drafts[0].platform, 'facebook')

    // Delegation statuses.
    assert.deepEqual(
      delegateCalls.find((c) => c.role === 'content'),
      { role: 'content', status: 'completed' },
    )
    assert.equal(
      delegateCalls.find((c) => c.role === 'marketing-analyst')?.status,
      'unavailable',
      'marketing-analyst remains honestly unavailable',
    )

    // One Director LLM step + one Content LLM step on the SAME shared tracker.
    assert.equal(tracker.snapshot().llmCalls, 2)

    // Enriched draft metadata captured with status 'draft' and never scheduled.
    assert.equal(result.drafts.length, 1)
    const draft = result.drafts[0]
    assert.equal(draft.status, 'draft')
    assert.equal(draft.platform, 'facebook')
    assert.equal(draft.caption, 'عرض رمضان ٢٠٪')
    assert.equal(draft.hashtags, '#رمضان #عرض')
    assert.equal(draft.visualBrief, 'Flat-lay of iftar items, warm lighting.')
    assert.equal(calendar.rows[0].status, 'draft')
    assert.equal(calendar.rows[0].scheduled_for, null, 'a draft must never be auto-scheduled')

    await collector.flush()
    assert.ok(captured.length >= 1)
    const events = captured.flatMap((c) => c.events)

    // Every nested event shares the same traceId.
    for (const event of events) {
      assert.equal(event.trace_id, TRACE_ID, 'every nested event shares the same traceId')
    }

    // The Content Agent node nests under the Director instance.
    const agentEvents = events.filter((e) => e.event_type === 'agent')
    const contentEvent = agentEvents.find((e) => e.agent_role === 'content')
    assert.ok(contentEvent, 'content agent event recorded')
    assert.equal(contentEvent?.parent_event_id, DIRECTOR_INSTANCE, 'content nests under the director instance')
    const contentInstance = contentEvent?.instance_id

    // projectTraceEvents projects the Content node and its skills/tools cleanly.
    const projected = projectTraceEvents(events as never)
    const contentNode = projected.find((e) => e.event_type === 'agent' && e.agent_role === 'content')
    assert.ok(contentNode, 'content agent projects to a canvas node')

    const toolNodes = projected.filter((e) => e.event_type === 'tool_call')
    const skillNodes = projected.filter((e) => e.event_type === 'skill_read')
    assert.ok(toolNodes.length >= 1, 'content tool calls project to tool_call nodes')
    assert.ok(skillNodes.length >= 1, 'content skill reads project to skill_read nodes')

    // The content tool/skill chips attach to the content agent instance.
    const contentTool = toolNodes.find((e) => e.parent_instance_id === contentInstance)
    const contentSkill = skillNodes.find((e) => e.parent_instance_id === contentInstance)
    assert.ok(contentTool, 'a content tool call attaches to the content agent')
    assert.ok(contentSkill, 'a content skill read attaches to the content agent')
    // Model/internal events never leak into the canvas projection.
    assert.equal(projected.some((e) => e.event_type === 'model'), false)
  })

  it('ignores string "null"/"None" clarificationRequest values when drafts are produced', async () => {
    const tracker = new TaskGuardrailTracker()
    const runTurn: AgentTurnRunner = async (opts) => {
      const payload = JSON.stringify({
        status: 'completed',
        drafts: [
          {
            id: 'post-1',
            itemType: 'post_draft',
            platform: 'facebook',
            title: 'BusMora intro',
            body: 'بوسمورا بيساعدك ترتب تسويق مشروعك.',
            readiness: 'draft_ready',
          },
        ],
        clarificationRequest: 'null',
        stopReason: 'assigned_output_complete',
      })
      const s = step(payload, null)
      opts.onStepFinish?.(s)
      return turn(payload, [s])
    }

    const result = await runContentAgent({
      workspaceId: 'ws-1',
      assignment: { goal: 'Write a BusMora Facebook post', outputLanguage: 'ar-EG' },
      traceContext: { traceId: TRACE_ID, parentEventId: DIRECTOR_INSTANCE },
      tracker,
      runTurn,
      brain: makeFakeBrain(),
      deliverables: fakeDeliverables,
      calendar: makeFakeCalendar().store,
    })

    assert.equal(result.clarificationRequest, null)
    assert.equal(result.status, 'completed')
    assert.equal(result.drafts.length, 1)
  })
})