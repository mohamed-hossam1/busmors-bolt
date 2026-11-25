import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_MODE } from '../../src/config/ai-models'
import { runResearchAgent, type ResearchResult } from '../../src/server/employee/agents/research'
import { runDirector, type DirectorOutput } from '../../src/server/employee/agents/director'
import { TaskGuardrailTracker } from '../../src/server/employee/agent-runtime'
import { createTraceCollector } from '../../src/server/observability'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type {
  CalendarStore,
  CreateOrUpdatePostDraftInput,
  CreateOrVersionDeliverableInput,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'

/**
 * Live Research Agent smoke tests (Phase 4).
 *
 * These run against the real configured model and therefore respect the active
 * AI_MODE from the environment (no hardcoded override): the same command works
 * in test and production. All stores are deterministic in-memory fakes, so the
 * tests need no database and never mutate real data. Web tools are the real
 * shared adapters: if keys are missing they report `unavailable` honestly.
 *
 * Run a single scenario with a CLI/env filter, e.g.:
 *   npm run test:live -- --case=egypt-competitors
 *   RESEARCH_CASE=director-research-e2e npm run test:live
 * With no filter, all cases run. Per the live-test discipline, run at most ONE
 * live pass per scenario; fix failures offline before re-running only that case.
 *
 * Provider note: in test mode the primary model is Apinex `free/gpt-6-luna`
 * (fallback Groq). The director-research-e2e flow makes several model calls in
 * one task, so run it with the Apinex key configured (APINEX_API_KEY) and an
 * account with available balance; a low free-tier TPM cap on the fallback can
 * otherwise exhaust the per-minute rate.
 */

const TRACE_ID = '99999999-9999-4999-8999-999999999999'
const URL_RE = /https?:\/\/\S+/

type CaseName = 'egypt-competitors' | 'director-research-e2e'

function selectedCase(): CaseName | null {
  const fromEnv = process.env.RESEARCH_CASE
  const raw = fromEnv ?? process.argv.find((a) => a.startsWith('--case='))?.slice('--case='.length)
  if (raw === 'egypt-competitors' || raw === 'director-research-e2e') return raw
  return null
}

const ONLY = selectedCase()
const run = (name: CaseName) => ONLY === null || ONLY === name

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [
      {
        id: 'node-1',
        category: 'company_profile',
        title: 'Acme Bakery',
        summary: 'A neighborhood bakery in Cairo selling bread and pastries.',
        properties: {},
        version: 1,
        source: 'manual',
        sourceDetail: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    proposeChange: async () => ({ proposalId: 'proposal-1', status: 'pending', duplicate: false, conflict: false }),
  }
}

function makeFakeDeliverables() {
  const created: CreateOrVersionDeliverableInput[] = []
  let seq = 0
  const store: DeliverableStore = {
    async createOrVersion(input) {
      created.push(input)
      seq += 1
      return { deliverableId: `del-${seq}`, version: input.deliverableId ? 2 : 1, created: !input.deliverableId }
    },
    async readRecent() {
      return []
    },
  }
  return { store, created }
}

function makeFakeCalendar() {
  const created: CreateOrUpdatePostDraftInput[] = []
  let seq = 0
  const store: CalendarStore = {
    async createOrUpdateDraft(input) {
      created.push(input)
      seq += 1
      return { postId: `post-${seq}`, version: 1, created: !input.postId, proposedFor: input.proposedFor ?? null }
    },
    async readDrafts() {
      return []
    },
  }
  return { store, created }
}

const workspace: WorkspaceContextStore = {
  read: async () => ({ companyName: 'Acme Bakery', settings: { timezone: 'Africa/Cairo', language: 'ar' } }),
}

function hasRealSource(result: ResearchResult): boolean {
  return result.sources.some((s) => URL_RE.test(s.url))
}

describe(`live research smoke tests (AI_MODE=${AI_MODE})`, () => {
  it('egypt-competitors: standalone research loads a skill and reports real sources or honest unavailability', { skip: !run('egypt-competitors'), timeout: 240_000 }, async () => {
    const tracker = new TaskGuardrailTracker()
    const result = await runResearchAgent({
      workspaceId: 'ws-live',
      assignment: {
        goal: 'Check direct competitors for a small neighborhood bakery in Cairo and summarise observable offerings.',
        scope: 'Cairo, Egypt. Egyptian SMBs, including social-only pages where evidenced.',
        outputLanguage: 'ar',
      },
      traceContext: { traceId: TRACE_ID },
      tracker,
      brain: makeFakeBrain(),
      deliverables: makeFakeDeliverables().store,
    })
    console.log(
      '[research smoke] egypt-competitors',
      JSON.stringify({
        status: result.status,
        loadedSkills: result.loadedSkills,
        usedTools: result.usedTools,
        sourceCount: result.sources.length,
        llmCalls: tracker.snapshot().llmCalls,
      }),
    )
    assert.notEqual(result.status, 'failed', 'research should not hard-fail')
    assert.notEqual(result.status, 'cancelled')
    // Loads at most a couple of relevant skills (never all five by default).
    assert.ok(result.loadedSkills.length <= 2, 'lazy skill loading: at most two skills')
    if (hasRealSource(result)) {
      // Real evidence must carry actual URLs; no invented prices are asserted here
      // because the model is instructed never to fabricate them.
      assert.ok(result.sources.every((s) => URL_RE.test(s.url)), 'every captured source has a real URL')
    } else {
      // No web keys: the agent must be honest about the gap, not fabricate sources.
      assert.ok(
        result.limitations.length > 0 || result.status === 'partial' || result.usedTools.length === 0,
        'without web access the result reports the limitation honestly',
      )
    }
  })

  it('director-research-e2e: Director delegates research, reviews it, and persists the report', { skip: !run('director-research-e2e'), timeout: 300_000 }, async () => {
    const input =
      'المطلوب: بحث سوق عن المنافسين المباشرين لمخبز "أكهم" في القاهرة. ' +
      'الخطوات المطلوبة بالترتيب: (1) فوّض Research Agent باستخدام delegate_agent يعمل بحث المنافسين. ' +
      '(2) راجع النتائج اللي رجعها. ' +
      '(3) احفظ الناتج النهائي في Deliverables باستخدام أداة create_or_version_deliverable — ' +
      'دي خطوة إجبارية، مش مجرد رد في الشات. ' +
      'مهم جدًا: ما تخترعش أسعار أو مصادر، واستخدم الأرقام والمصادر الفعلية اللي رجعها البحث فقط.'

    const attempt = async (): Promise<{ result: DirectorOutput; modelErrors: Array<{ op: unknown; error: unknown }> }> => {
      const fake = makeFakeDeliverables()
      const tracker = new TaskGuardrailTracker()
      const captured: Array<Record<string, unknown>> = []
      const collector = createTraceCollector(
        { traceId: TRACE_ID, workspaceId: 'ws-live', request: 'research e2e' },
        { enabled: true, sink: async (_trace, events) => { captured.push(...(events as unknown as Array<Record<string, unknown>>)) } },
      )
      const result = await runDirector({
        workspaceId: 'ws-live',
        input,
        traceContext: { traceId: TRACE_ID },
        tracker,
        collector,
        brain: makeFakeBrain(),
        deliverables: fake.store,
        calendar: makeFakeCalendar().store,
        workspace,
      })
      await collector.flush()
      const modelErrors = captured
        .filter((e) => e.event_type === 'model' && e.error)
        .map((e) => ({ op: e.operation, error: e.error }))
      console.log(
        '[research smoke] director-research-e2e',
        JSON.stringify({
          status: result.status,
          stopReason: result.stopReason,
          textLength: result.text.length,
          usedTools: result.usedTools,
          researchCount: result.research.length,
          researchStatuses: result.research.map((r) => r.status),
          saved: result.deliverables,
          llmCalls: tracker.snapshot().llmCalls,
          modelErrors,
        }),
      )
      return { result, modelErrors }
    }

    const { result } = await attempt()

    assert.ok(result.research.length >= 1, 'the Director must delegate to the Research Agent')
    assert.ok(
      result.usedTools.includes('delegate_agent'),
      'expected delegate_agent to be used',
    )
    assert.ok(
      result.usedTools.includes('create_or_version_deliverable'),
      'expected the final report to be persisted via create_or_version_deliverable',
    )
    assert.ok(result.deliverables.length >= 1, 'a substantial research report must be persisted')
  })
})