import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_MODE } from '../../src/config/ai-models'
import { runDirector, type DirectorOutput } from '../../src/server/employee/agents/director'
import { TaskGuardrailTracker } from '../../src/server/employee/agent-runtime'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type {
  CalendarStore,
  CreateOrUpdatePostDraftInput,
  CreateOrVersionDeliverableInput,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'

/**
 * Live Director smoke tests.
 *
 * These run against the real configured model and therefore respect the active
 * AI_MODE from the environment (no hardcoded override): the same command works
 * in test and production. All stores are deterministic in-memory fakes, so the
 * tests need no database and never mutate real data.
 *
 * Run a single scenario with a CLI filter, e.g.:
 *   npm run test:live -- --case=direct-advice
 *   node --env-file=.env --import tsx --test tests/live/director-smoke.test.ts -- --case=deliverable
 * With no filter, all cases run. Per the live-test discipline, run at most ONE
 * live pass per scenario; fix failures offline before re-running only that case.
 */

const TRACE_ID = '66666666-6666-4666-8666-666666666666'
const ARABIC_RE = /[\u0600-\u06FF]/

type CaseName = 'direct-advice' | 'deliverable' | 'clarification'

function selectedCase(): CaseName | null {
  // Prefer an explicit env var (robust across the node --test child process),
  // then fall back to a --case= CLI flag.
  const fromEnv = process.env.DIRECTOR_CASE
  const raw = fromEnv ?? process.argv.find((a) => a.startsWith('--case='))?.slice('--case='.length)
  if (raw === 'direct-advice' || raw === 'deliverable' || raw === 'clarification') return raw
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
        version: 2,
        source: 'manual',
        sourceDetail: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    proposeChange: async () => ({ proposalId: 'proposal-1', status: 'pending', duplicate: false, conflict: false, baseVersion: 2 }),
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

async function runDirectorCase(text: string): Promise<{ result: DirectorOutput; tracker: TaskGuardrailTracker }> {
  const tracker = new TaskGuardrailTracker()
  const result = await runDirector({
    workspaceId: 'ws-live',
    input: text,
    traceContext: { traceId: TRACE_ID },
    tracker,
    brain: makeFakeBrain(),
    deliverables: makeFakeDeliverables().store,
    calendar: makeFakeCalendar().store,
    workspace,
  })
  return { result, tracker }
}

describe(`live director smoke tests (AI_MODE=${AI_MODE})`, () => {
  it('direct-advice: answers a simple Egyptian Arabic marketing question directly', { skip: !run('direct-advice'), timeout: 180_000 }, async () => {
    const { result, tracker } = await runDirectorCase('إزاي أختار أفضل وقت للنشر على فيسبوك لمخبز صغير في القاهرة؟')
    console.log('[director smoke] direct-advice', JSON.stringify({ status: result.status, usedTools: result.usedTools, loadedSkills: result.loadedSkills, llmCalls: tracker.snapshot().llmCalls }))
    assert.notEqual(result.status, 'partial')
    assert.ok(result.text.trim().length > 0, 'director should reply with advice')
    assert.ok(ARABIC_RE.test(result.text), 'reply should be in Arabic script')
    assert.equal(result.deliverables.length, 0, 'a simple question should not persist a deliverable')
    // Loads at most one relevant skill (never all seven by default).
    assert.ok(result.loadedSkills.length <= 1, 'lazy skill loading: at most one skill for a simple question')
  })

  it('deliverable: produces a mini strategy and persists it via create_or_version_deliverable', { skip: !run('deliverable'), timeout: 240_000 }, async () => {
    const fake = makeFakeDeliverables()
    const tracker = new TaskGuardrailTracker()
    const result = await runDirector({
      workspaceId: 'ws-live',
      input:
        'اعمل لي استراتيجية تسويق مصغرة جاهزة لمخبز "أكهم" في القاهرة لرمضان. ' +
        'المخبز بيبيع عيش وحلويات، الجمهور عائلات في القاهرة. ' +
        'اكتبها في ٣ نقاط رئيسية (الهدف، الجمهور والعرض، القناة والـCTA) من غير أسئلة، ونفّذها مباشرة. ' +
        'مهم: احفظ الناتج كاستراتيجية في Deliverables باستخدام أداة create_or_version_deliverable، مش مجرد رد في الشات.',
      traceContext: { traceId: TRACE_ID },
      tracker,
      brain: makeFakeBrain(),
      deliverables: fake.store,
      calendar: makeFakeCalendar().store,
      workspace,
    })
    console.log('[director smoke] deliverable', JSON.stringify({ status: result.status, usedTools: result.usedTools, loadedSkills: result.loadedSkills, saved: result.deliverables, llmCalls: tracker.snapshot().llmCalls }))
    assert.ok(
      result.usedTools.includes('create_or_version_deliverable'),
      'expected create_or_version_deliverable to be used',
    )
    assert.ok(result.deliverables.length >= 1, 'a substantial strategy must be persisted')
    assert.equal(fake.created.length, result.deliverables.length)
    assert.ok(ARABIC_RE.test(result.text), 'reply should be in Arabic script')
  })

  it('clarification: returns a structured Clarification Card for a vague request', { skip: !run('clarification'), timeout: 240_000 }, async () => {
    const { result } = await runDirectorCase('عايز أعمل حاجة تسويقية.')
    console.log('[director smoke] clarification', JSON.stringify({ status: result.status, usedTools: result.usedTools, clarification: result.clarification }))
    assert.ok(
      result.usedTools.includes('ask_clarification') || result.clarification !== null,
      'expected ask_clarification to be used for a vague request',
    )
    assert.ok(result.clarification, 'a Clarification Card must be returned')
    assert.ok(result.clarification.questions.length >= 1 && result.clarification.questions.length <= 3)
    for (const q of result.clarification.questions) {
      assert.ok(q.options.length >= 1, 'each question offers choices')
    }
  })
})