import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_MODE } from '../../src/config/ai-models'
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
 * Live Content Agent smoke test (Phase 5 Part B).
 *
 * Runs against the real configured model and therefore respects the active
 * AI_MODE from the environment (never hardcoded): the same command works in test
 * and production. All stores are deterministic in-memory fakes, so the test needs
 * no database and never mutates real data.
 *
 * Run the single scenario with a CLI/env filter, e.g.:
 *   npm run test:live -- --case=director-content-fb-draft
 *   CONTENT_CASE=director-content-fb-draft npm run test:live
 * With no filter, the scenario runs. Per the live-test discipline, run at most
 * ONE live pass; fix failures offline before re-running only this case.
 */

const TRACE_ID = '99999999-9999-4999-8999-999999999999'
const ARABIC_RE = /[\u0600-\u06FF]/
type CaseName = 'director-content-fb-draft'

function selectedCase(): CaseName | null {
  const fromEnv = process.env.CONTENT_CASE
  const raw = fromEnv ?? process.argv.find((a) => a.startsWith('--case='))?.slice('--case='.length)
  return raw === 'director-content-fb-draft' ? raw : null
}

const ONLY = selectedCase()
const run = (name: CaseName) => ONLY === null || ONLY === name

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [
      {
        id: 'node-1',
        category: 'company_profile',
        title: 'BusMora',
        summary: 'BusMora is an AI marketing director for Egyptian small businesses: it turns real business facts into Arabic-first content, calendars and reports.',
        properties: {},
        version: 1,
        source: 'manual',
        sourceDetail: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'node-2',
        category: 'audience',
        title: 'Customers',
        summary: 'BusMora serves Egyptian SMBs (retail, services, food) that sell to Arabic-speaking customers in Egypt, Saudi Arabia and the UAE.',
        properties: {},
        version: 1,
        source: 'manual',
        sourceDetail: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'node-3',
        category: 'brand_rule',
        title: 'Voice',
        summary: 'BusMora writes in natural Egyptian Arabic, practical and concise, never exaggerated slang or inflated promises.',
        properties: {},
        version: 1,
        source: 'manual',
        sourceDetail: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'node-4',
        category: 'offering',
        title: 'Core Offer & CTA',
        summary: 'BusMora gives business owners market research, Arabic content drafts, and owner-approved Facebook scheduling. CTA: ابعتلنا رسالة على الصفحة عشان تجرب بنفسك.',
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

interface FakePostRow {
  id: string
  platform: 'facebook' | 'instagram'
  caption: string
  status: string
  scheduled_for: string | null
  proposed_for: string | null
}

function makeFakeCalendar() {
  const rows: FakePostRow[] = []
  const created: CreateOrUpdatePostDraftInput[] = []
  let seq = 0
  const store: CalendarStore = {
    async createOrUpdateDraft(input) {
      created.push(input)
      seq += 1
      const row: FakePostRow = {
        id: `post-${seq}`,
        platform: input.platform,
        caption: input.caption,
        status: 'draft', // a draft is NEVER scheduled/published
        scheduled_for: null,
        proposed_for: input.proposedFor ?? null,
      }
      rows.push(row)
      return { postId: row.id, version: 1, created: !input.postId, proposedFor: row.proposed_for }
    },
    async readDrafts() {
      return []
    },
  }
  return { store, rows, created }
}

const workspace: WorkspaceContextStore = {
  read: async () => ({ companyName: 'BusMora', settings: { timezone: 'Africa/Cairo', language: 'ar' } }),
}

describe(`live content smoke tests (AI_MODE=${AI_MODE})`, () => {
  it(
    'director-content-fb-draft: Director delegates to Content and persists >=2 Arabic Facebook drafts (never scheduled)',
    { skip: !run('director-content-fb-draft'), timeout: 300_000 },
    async () => {
      const input =
        'المطلوب: اطلب من Content Agent يعمل بوستين فيسبوك بالعربي المصري عن BusMora. ' +
        'استخدم معلومات BusMora الحقيقية من الـ Business Brain (مساعد تسويقي ذكي للشركات المصرية، بيكتب عربي مصري طبيعي، ' +
        'بيحوّل المعلومات لحاجات ومحتوى وتقويم). السياق: مصر، التوقيت Africa/Cairo. ' +
        'الخطوات: (1) فوّض Content Agent باستخدام delegate_agent. (2) راجع البوستين. ' +
        '(3) احفظ كل بوست كـ Calendar draft باستخدام create_or_update_post_draft — دي خطوة إجبارية. ' +
        'مهم: البوستين لازم يكونوا بالعربي المصري، ومتخترعش أسعار أو عروض أو روابط.'

      const calendar = makeFakeCalendar()
      const tracker = new TaskGuardrailTracker()
      const captured: Array<Record<string, unknown>> = []
      const collector = createTraceCollector(
        { traceId: TRACE_ID, workspaceId: 'ws-live', request: 'content fb draft' },
        { enabled: true, sink: async (_trace, events) => { captured.push(...(events as unknown as Array<Record<string, unknown>>)) } },
      )

      const result: DirectorOutput = await runDirector({
        workspaceId: 'ws-live',
        input,
        traceContext: { traceId: TRACE_ID },
        tracker,
        collector,
        brain: makeFakeBrain(),
        deliverables: makeFakeDeliverables().store,
        calendar: calendar.store,
        workspace,
      })
      await collector.flush()

      console.log(
        '[content smoke] director-content-fb-draft',
        JSON.stringify({
          status: result.status,
          stopReason: result.stopReason,
          contentCount: result.content.length,
          contentStatuses: result.content.map((c) => c.status),
          loadedSkills: result.content.map((c) => c.loadedSkills),
          usedTools: result.usedTools,
          calendarRows: calendar.rows.length,
          draftCount: result.drafts.length,
          llmCalls: tracker.snapshot().llmCalls,
        }),
      )

      // The Content Agent was actually invoked and loaded at least one skill.
      assert.ok(result.content.length >= 1, 'the Director must delegate to the Content Agent')
      assert.ok(
        result.content.some((c) => c.loadedSkills.length >= 1),
        'the Content Agent must lazily load at least one Content skill',
      )

      // At least two drafts were persisted via create_or_update_post_draft.
      assert.ok(
        calendar.rows.length >= 2 || result.drafts.length >= 2,
        'at least two drafts must be persisted via create_or_update_post_draft',
      )

      // Every persisted draft is an unscheduled Facebook draft with Arabic copy.
      const persisted = calendar.rows.length > 0 ? calendar.rows : result.drafts
      assert.ok(persisted.length >= 2, 'at least two persisted drafts are available to verify')
      for (const draft of persisted) {
        assert.equal(draft.platform, 'facebook', 'every draft targets Facebook')
        assert.equal(draft.status, 'draft', 'every draft stays a draft')
        if ('scheduled_for' in draft) {
          assert.equal(draft.scheduled_for, null, 'a draft is never scheduled')
        }
        assert.match(draft.caption ?? '', ARABIC_RE, 'every draft contains Arabic text')
      }
    },
  )
})