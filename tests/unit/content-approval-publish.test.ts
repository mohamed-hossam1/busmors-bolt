import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  approveAndSendPost,
  type ApproveAndSendDeps,
  type AuthorizePublishArgs,
} from '../../src/server/publishing/approve-and-publish'
import type { PublishResult } from '../../src/server/publishing/publish-core'
import {
  createDirectorRunState,
  createDirectorToolDefinitions,
  type DirectorToolDeps,
} from '../../src/server/employee/tools/director-tools'
import type {
  CalendarStore,
  CreateOrUpdatePostDraftInput,
  CreateOrVersionDeliverableInput,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'
import type { BrainStore } from '../../src/server/employee/brain-store'

/**
 * Deterministic unit tests for the Phase 5 Part B approval → Facebook
 * scheduling/publishing flow. ZERO live API calls: the pure
 * `approveAndSendPost` core runs against in-memory deps, the AI draft path runs
 * through the real Director tool definition with a fake CalendarStore that
 * mirrors the SQL invariants, and the SQL contract is asserted by reading the
 * migration files.
 */

// ---- Fakes ------------------------------------------------------------------

interface FakePostRow {
  id: string
  platform: 'facebook' | 'instagram'
  caption: string
  status: string
  approval_state: string
  scheduled_for: string | null
  proposed_for: string | null
  version: number
}

/** CalendarStore that models create_or_update_post_draft's SQL invariants. */
function makeFakeCalendar() {
  const rows: FakePostRow[] = []
  let seq = 0
  const store: CalendarStore = {
    async createOrUpdateDraft(input: CreateOrUpdatePostDraftInput) {
      if (input.postId) {
        const row = rows.find((r) => r.id === input.postId)
        if (!row) throw new Error('NOT_FOUND')
        if (input.expectedVersion !== null && input.expectedVersion !== undefined && row.version !== input.expectedVersion) {
          throw new Error('VERSION_CONFLICT')
        }
        if (['published', 'publishing', 'scheduled'].includes(row.status)) throw new Error('LOCKED')
        if (input.caption !== row.caption) {
          row.version += 1
          row.caption = input.caption
          row.status = 'draft'
          row.approval_state = 'unapproved'
          row.scheduled_for = null
        }
        return { postId: row.id, version: row.version, created: false, proposedFor: row.proposed_for }
      }
      seq += 1
      const row: FakePostRow = {
        id: `post-${seq}`,
        platform: input.platform,
        caption: input.caption,
        status: 'draft',
        approval_state: 'unapproved',
        scheduled_for: null, // a draft is NEVER scheduled
        proposed_for: input.proposedFor ?? null,
        version: 1,
      }
      rows.push(row)
      return { postId: row.id, version: 1, created: true, proposedFor: row.proposed_for }
    },
    async readDrafts() {
      return rows.map((r) => ({ id: r.id, platform: r.platform, caption: r.caption, status: r.status, proposed_for: r.proposed_for, version: r.version }))
    },
  }
  return { store, rows }
}

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [],
    proposeChange: async () => ({ proposalId: 'p', status: 'pending', duplicate: false, conflict: false }),
  }
}

const fakeDeliverables: DeliverableStore = {
  createOrVersion: async (_input: CreateOrVersionDeliverableInput) => ({ deliverableId: 'd', version: 1, created: true }),
  readRecent: async () => [],
}

const fakeWorkspace: WorkspaceContextStore = { read: async () => ({ companyName: 'BusMora', settings: { timezone: 'Africa/Cairo' } }) }

function directorDeps(calendar: CalendarStore): DirectorToolDeps {
  return {
    brain: makeFakeBrain(),
    deliverables: fakeDeliverables,
    calendar,
    workspace: fakeWorkspace,
    runState: createDirectorRunState(),
    loadSkill: async () => {
      throw new Error('no skill in this test')
    },
  }
}

// ---- approveAndSendPost deps harness ---------------------------------------

interface DepsCalls {
  updatePostStatus: Array<{ postId: string; version: number }>
  authorizePublish: AuthorizePublishArgs[]
  publish: Array<{ postId: string; mode: 'now' | 'schedule' }>
}

function makeDeps(overrides: Partial<ApproveAndSendDeps> = {}): { deps: ApproveAndSendDeps; calls: DepsCalls } {
  const calls: DepsCalls = { updatePostStatus: [], authorizePublish: [], publish: [] }
  const deps: ApproveAndSendDeps = {
    providerConfigured: true,
    updatePostStatus: async (postId, version) => {
      calls.updatePostStatus.push({ postId, version })
      return { version: version + 1 }
    },
    authorizePublish: async (args) => {
      calls.authorizePublish.push(args)
      return {}
    },
    publish: async (postId, mode) => {
      calls.publish.push({ postId, mode })
      return mode === 'schedule'
        ? { state: 'scheduled' }
        : { state: 'confirmed', permalink: 'https://facebook.com/post-1' }
    },
    ...overrides,
  }
  return { deps, calls }
}

// ---- Tests ------------------------------------------------------------------

describe('AI draft creation only ever creates an unscheduled draft', () => {
  it('create_or_update_post_draft persists status=draft and scheduled_for=null', async () => {
    const fake = makeFakeCalendar()
    const deps = directorDeps(fake.store)
    const defs = createDirectorToolDefinitions(deps)
    const tool = defs.find((d) => d.name === 'create_or_update_post_draft')
    assert.ok(tool, 'the create_or_update_post_draft tool exists')

    const result = (await tool!.execute(
      { platform: 'facebook', caption: 'عرض رمضان', hashtags: '#رمضان', proposedFor: '2026-03-01T18:00:00+02:00' },
      {} as never,
    )) as { postId: string; created: boolean; proposedFor: string | null }

    assert.equal(result.created, true)
    assert.equal(result.proposedFor, '2026-03-01T18:00:00+02:00')
    const row = fake.rows[0]
    assert.equal(row.status, 'draft')
    assert.equal(row.scheduled_for, null, 'a draft must never be scheduled')
    assert.notEqual(row.status, 'published')
    // The captured card metadata also reports 'draft' (never an auto-schedule).
    assert.equal(deps.runState.drafts.length, 1)
    assert.equal(deps.runState.drafts[0].status, 'draft')
  })

  it('revising with a stale expectedVersion is rejected with VERSION_CONFLICT', async () => {
    const fake = makeFakeCalendar()
    const deps = directorDeps(fake.store)
    const defs = createDirectorToolDefinitions(deps)
    const tool = defs.find((d) => d.name === 'create_or_update_post_draft')!

    const created = (await tool.execute({ platform: 'instagram', caption: 'First' }, {} as never)) as { postId: string; version: number }
    await assert.rejects(
      () => tool.execute({ postId: created.postId, expectedVersion: created.version + 5, platform: 'instagram', caption: 'Second' }, {} as never),
      /VERSION_CONFLICT/,
    )
    // The original draft is untouched (still a draft, never scheduled).
    assert.equal(fake.rows[0].caption, 'First')
    assert.equal(fake.rows[0].status, 'draft')
    assert.equal(fake.rows[0].scheduled_for, null)
  })
})

describe('approveAndSendPost — schedule mode', () => {
  it('approves the draft, authorizes the bumped version + instant, then publishes (scheduled)', async () => {
    const { deps, calls } = makeDeps()
    const instantIso = '2026-03-01T18:00:00.000Z'

    const result = await approveAndSendPost(deps, {
      postId: 'post-1',
      expectedVersion: 1,
      mode: 'schedule',
      instantIso,
      timezone: 'Africa/Cairo',
      currentStatus: 'draft',
    })

    assert.equal(result.approved, true)
    assert.equal(result.version, 2)
    assert.deepEqual(result.result, { state: 'scheduled' })
    // Step 1 approved the draft at the original version.
    assert.deepEqual(calls.updatePostStatus, [{ postId: 'post-1', version: 1 }])
    // Step 2 authorized the confirmed time with the bumped version.
    assert.equal(calls.authorizePublish.length, 1)
    assert.equal(calls.authorizePublish[0].postId, 'post-1')
    assert.equal(calls.authorizePublish[0].expectedVersion, 2)
    assert.equal(calls.authorizePublish[0].mode, 'schedule')
    assert.equal(calls.authorizePublish[0].instantIso, instantIso)
    assert.equal(calls.authorizePublish[0].zone, 'Africa/Cairo')
    // Step 3 sent once.
    assert.deepEqual(calls.publish, [{ postId: 'post-1', mode: 'schedule' }])
  })
})

describe('approveAndSendPost — now mode', () => {
  it('publishes immediately (confirmed) and skips re-approval when already approved', async () => {
    const confirmed: PublishResult = { state: 'confirmed', permalink: 'https://facebook.com/post-1' }
    const { deps, calls } = makeDeps()

    const result = await approveAndSendPost(deps, {
      postId: 'post-1',
      expectedVersion: 3,
      mode: 'now',
      timezone: 'Africa/Cairo',
      currentStatus: 'approved',
    })

    assert.equal(result.approved, true)
    assert.equal(result.version, 3)
    assert.deepEqual(result.result, confirmed)
    assert.equal(calls.updatePostStatus.length, 0, 'an already-approved post is not re-approved')
    assert.equal(calls.authorizePublish[0].expectedVersion, 3)
    assert.equal(calls.authorizePublish[0].mode, 'now')
    assert.deepEqual(calls.publish, [{ postId: 'post-1', mode: 'now' }])
  })
})

describe('approveAndSendPost — missing Facebook connection', () => {
  it('keeps the approved draft (approved:true, needsConnection:true) and never publishes', async () => {
    const { deps, calls } = makeDeps({
      authorizePublish: async () => ({ error: 'NO_CONNECTION' }),
    })

    const result = await approveAndSendPost(deps, {
      postId: 'post-1',
      expectedVersion: 1,
      mode: 'schedule',
      instantIso: '2026-03-01T18:00:00.000Z',
      timezone: 'Africa/Cairo',
      currentStatus: 'draft',
    })

    assert.equal(result.approved, true, 'the draft stays approved in the DB')
    assert.equal(result.needsConnection, true)
    assert.equal(result.error, 'errNoConnection')
    assert.equal(result.version, 2)
    // Step 1 succeeded; step 3 never ran.
    assert.equal(calls.updatePostStatus.length, 1)
    assert.equal(calls.publish.length, 0)
    assert.ok(result.error && result.error.length > 0, 'an actionable error is returned')
  })

  it('reports publishingNotConfigured and keeps the approved draft when no provider is configured', async () => {
    const { deps, calls } = makeDeps({ providerConfigured: false })
    const result = await approveAndSendPost(deps, {
      postId: 'post-1', expectedVersion: 1, mode: 'now', timezone: 'Africa/Cairo', currentStatus: 'draft',
    })
    assert.equal(result.approved, true)
    assert.equal(result.error, 'publishingNotConfigured')
    assert.equal(calls.updatePostStatus.length, 1)
    assert.equal(calls.authorizePublish.length, 0)
    assert.equal(calls.publish.length, 0)
  })
})

describe('approveAndSendPost — version conflict', () => {
  it('fails cleanly on VERSION_CONFLICT without authorizing or publishing', async () => {
    const { deps, calls } = makeDeps({
      updatePostStatus: async () => ({ version: 1, error: 'VERSION_CONFLICT' }),
    })

    const result = await approveAndSendPost(deps, {
      postId: 'post-1', expectedVersion: 1, mode: 'now', timezone: 'Africa/Cairo', currentStatus: 'draft',
    })

    assert.equal(result.approved, false)
    assert.equal(result.needsConnection, false)
    assert.equal(result.error, 'VERSION_CONFLICT')
    assert.equal(calls.authorizePublish.length, 0)
    assert.equal(calls.publish.length, 0)
  })
})

describe('SQL migration contract (edit invalidates approval, resets to draft)', () => {
  const migrations = new URL('../../supabase/migrations/', import.meta.url)

  it('create_or_update_post_draft invalidates approvals and resets status/approval_state on edit', async () => {
    const sql = await readFile(new URL('20261125140000_director_delivery_rpcs.sql', migrations), 'utf8')
    assert.match(sql, /UPDATE post_approvals SET revoked_at=now\(\)/, 'revokes stale post_approvals')
    assert.match(sql, /status='draft'/, 'resets status to draft')
    assert.match(sql, /approval_state='unapproved'/, 'resets approval_state to unapproved')
    // A create always writes scheduled_for NULL.
    assert.match(sql, /'draft',NULL,prop/, 'create inserts status=draft with scheduled_for NULL')
  })

  it('update_post invalidates approvals and resets status/approval_state on a caption edit', async () => {
    const sql = await readFile(new URL('20261121130000_post_approval_and_publish.sql', migrations), 'utf8')
    assert.match(sql, /UPDATE post_approvals SET revoked_at=now\(\) WHERE workspace_id=w AND post_id=p\.id AND revoked_at IS NULL;/, 'revokes unsent approvals')
    assert.match(sql, /status='draft', approval_state='unapproved'/, 'resets status and approval_state on edit')
    // The version guard that produces VERSION_CONFLICT.
    assert.match(sql, /RAISE EXCEPTION 'VERSION_CONFLICT'/, 'guards on expected version')
  })
})