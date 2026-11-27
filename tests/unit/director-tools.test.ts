import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { ToolBudgetTracker } from '../../src/server/employee/tool-registry'
import type {
  CalendarStore,
  CreateOrUpdatePostDraftInput,
  CreateOrVersionDeliverableInput,
  DeliverableStore,
  WorkspaceContextStore,
} from '../../src/server/employee/director-store'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type { SkillLoader as SkillLoaderType } from '../../src/server/employee/skill-loader'

// The employee runtime transitively imports ai-models, which fails closed unless
// AI_MODE is set. Set it before the dynamic imports below (same pattern as
// agent-runtime.test.ts) so these deterministic tests make zero live API calls.
const originalEnv = { AI_MODE: process.env.AI_MODE, GROQ_API_KEY: process.env.GROQ_API_KEY, DAHL_API_KEY: process.env.DAHL_API_KEY }

let registry: typeof import('../../src/server/employee/tool-registry')
let directorTools: typeof import('../../src/server/employee/tools/director-tools')
let skillLoader: typeof import('../../src/server/employee/skill-loader')
let agentRuntime: typeof import('../../src/server/employee/agent-runtime')
let TaskGuardrailTracker: typeof agentRuntime.TaskGuardrailTracker

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?director-tools-test=1'
  registry = await import(`../../src/server/employee/tool-registry.ts${tag}`)
  directorTools = await import(`../../src/server/employee/tools/director-tools.ts${tag}`)
  skillLoader = await import(`../../src/server/employee/skill-loader.ts${tag}`)
  agentRuntime = await import(`../../src/server/employee/agent-runtime.ts${tag}`)
  TaskGuardrailTracker = agentRuntime.TaskGuardrailTracker
})

after(() => {
  if (originalEnv.AI_MODE === undefined) delete process.env.AI_MODE
  else process.env.AI_MODE = originalEnv.AI_MODE
  if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY
  if (originalEnv.DAHL_API_KEY === undefined) delete process.env.DAHL_API_KEY
  else process.env.DAHL_API_KEY = originalEnv.DAHL_API_KEY
})

const TRACE_ID = '44444444-4444-4444-8444-444444444444'

type LooseTool = { inputSchema: { safeParse: (v: unknown) => { success: boolean } }; execute: (input: unknown, options?: unknown) => Promise<unknown> }
type LooseTools = Record<string, LooseTool>

type DirectorToolDeps = import('../../src/server/employee/tools/director-tools').DirectorToolDeps

function makeTracker(): ToolBudgetTracker & { recordToolUse: (name: string) => void } {
  return { canCallExternalTool: () => true, recordExternalToolCall: () => {}, recordToolUse: () => {} }
}

// ---- In-memory fakes that model the SQL table invariants ---------------------

interface FakeDeliverableRow {
  id: string
  version: number
  title: string
  content: string
  origin: Record<string, unknown>
}

function makeFakeDeliverableStore() {
  const rows: FakeDeliverableRow[] = []
  const versions: Array<{ deliverableId: string; version: number; content: string }> = []
  let seq = 0
  const store: DeliverableStore = {
    async createOrVersion(input: CreateOrVersionDeliverableInput) {
      if (input.deliverableId) {
        const row = rows.find((r) => r.id === input.deliverableId)
        if (!row) throw new Error('NOT_FOUND')
        if (input.expectedVersion !== null && input.expectedVersion !== undefined && row.version !== input.expectedVersion) {
          throw new Error('STALE_VERSION')
        }
        row.version += 1
        row.title = input.title
        row.content = input.content
        versions.push({ deliverableId: row.id, version: row.version, content: row.content })
        return { deliverableId: row.id, version: row.version, created: false }
      }
      if (input.idempotencyKey) {
        const existing = rows.find((r) => r.origin.idempotencyKey === input.idempotencyKey)
        if (existing) return { deliverableId: existing.id, version: existing.version, created: false }
      }
      seq += 1
      const row: FakeDeliverableRow = {
        id: `del-${seq}`,
        version: 1,
        title: input.title,
        content: input.content,
        origin: input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {},
      }
      rows.push(row)
      versions.push({ deliverableId: row.id, version: 1, content: row.content })
      return { deliverableId: row.id, version: 1, created: true }
    },
    async readRecent() {
      return rows.map((r) => ({ id: r.id, title: r.title, type: 'general', version: r.version, created_at: '' }))
    },
  }
  return { store, rows, versions }
}

interface FakePostRow {
  id: string
  version: number
  caption: string
  status: string
  approval_state: string
  proposed_for: string | null
  scheduled_for: string | null
}

function makeFakeCalendarStore() {
  const rows: FakePostRow[] = []
  const versions: Array<{ postId: string; revision: number }> = []
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
          row.approval_state = 'unapproved' // approval invalidated on revision
          versions.push({ postId: row.id, revision: row.version })
        }
        return { postId: row.id, version: row.version, created: false, proposedFor: row.proposed_for }
      }
      seq += 1
      const row: FakePostRow = {
        id: `post-${seq}`,
        version: 1,
        caption: input.caption,
        status: 'draft',
        approval_state: 'unapproved',
        proposed_for: input.proposedFor ?? null,
        scheduled_for: null, // a draft is NEVER scheduled
      }
      rows.push(row)
      versions.push({ postId: row.id, revision: 1 })
      return { postId: row.id, version: 1, created: true, proposedFor: row.proposed_for }
    },
    async readDrafts() {
      return rows.map((r) => ({ id: r.id, platform: 'facebook', caption: r.caption, status: r.status, proposed_for: r.proposed_for, version: r.version }))
    },
  }
  return { store, rows, versions }
}

function makeFakeBrain() {
  const store: BrainStore = {
    readApproved: async () => [],
    proposeChange: async () => ({ proposalId: 'prop-1', status: 'pending', duplicate: false, conflict: false, baseVersion: 0 }),
  }
  return { store }
}

function makeWorkspace(): WorkspaceContextStore {
  return { read: async () => ({ companyName: 'Acme', settings: { timezone: 'Africa/Cairo' } }) }
}

let baseDir: string

async function writeSkill(id: string, description: string): Promise<void> {
  const dir = path.join(baseDir, 'director', id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${id}\ndescription: "${description}"\nmetadata:\n  version: "1.0.0"\n---\n\n# ${id}\n\nBody of ${id}.\n`,
    'utf8',
  )
}

before(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), 'busmora-director-'))
  await writeSkill('marketing-strategy', 'Strategy skill.')
  await writeSkill('campaign-strategy', 'Campaign skill.')
})

after(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

function makeDeps(overrides: Partial<DirectorToolDeps> = {}): { deps: DirectorToolDeps; tracker: InstanceType<typeof TaskGuardrailTracker> } {
  const tracker = new TaskGuardrailTracker()
  const loader = new skillLoader.SkillLoader(baseDir) as SkillLoaderType
  const deps: DirectorToolDeps = {
    brain: makeFakeBrain().store,
    deliverables: makeFakeDeliverableStore().store,
    calendar: makeFakeCalendarStore().store,
    workspace: makeWorkspace(),
    runState: directorTools.createDirectorRunState(),
    loadSkill: (id) => loader.loadSkill('director', id, tracker),
    ...overrides,
  }
  return { deps, tracker }
}

function toolsFor(deps: DirectorToolDeps, workspaceId = 'ws-1'): LooseTools {
  const reg = registry.createToolRegistry(directorTools.createDirectorToolDefinitions(deps))
  return registry.getToolsForRole('director', reg, {
    workspaceId,
    tracker: new TaskGuardrailTracker(),
    traceId: TRACE_ID,
  }) as unknown as LooseTools
}

describe('director tool allowlist', () => {
  it('contains exactly the 13 spec tools, all internal except the 3 web tools', () => {
    const allowlist = registry.ROLE_TOOL_ALLOWLIST.director
    assert.deepEqual([...allowlist].sort(), [...directorTools.DIRECTOR_TOOL_NAMES].sort())

    const defs = directorTools.createDirectorToolDefinitions(makeDeps().deps)
    assert.deepEqual(defs.map((d) => d.name).sort(), [...directorTools.DIRECTOR_TOOL_NAMES].sort())

    const external = defs.filter((d) => d.external).map((d) => d.name).sort()
    assert.deepEqual(external, ['exa_search', 'firecrawl_scrape', 'tavily_search'])
  })

  it('grants no Composio, publishing, scheduling, or filesystem/shell tools', () => {
    const names = registry.ROLE_TOOL_ALLOWLIST.director
    for (const forbidden of ['composio', 'publish', 'schedule', 'shell', 'exec', 'read_file', 'write_file']) {
      assert.equal(
        names.some((n) => n.includes(forbidden)),
        false,
        `director must not be granted a "${forbidden}" capability`,
      )
    }
    // No direct DB write tools: only the two validated persistence tools exist.
    assert.ok(names.includes('create_or_version_deliverable'))
    assert.ok(names.includes('create_or_update_post_draft'))
    assert.equal(names.some((n) => /insert|update_table|sql|query_db/.test(n)), false)
  })
})

describe('lazy skill loading', () => {
  it('loads only the requested Director skill and deduplicates repeated reads', async () => {
    const { deps, tracker } = makeDeps()
    const tools = toolsFor(deps)

    const first = (await tools.read_skill.execute({ skillId: 'marketing-strategy' })) as { newlyLoaded: boolean; content: string }
    assert.equal(first.newlyLoaded, true)
    assert.match(first.content, /marketing-strategy/)

    const second = (await tools.read_skill.execute({ skillId: 'marketing-strategy' })) as { newlyLoaded: boolean }
    assert.equal(second.newlyLoaded, false, 'a repeated read is deduplicated')

    await tools.read_skill.execute({ skillId: 'campaign-strategy' })

    // Only the two explicitly requested skills were loaded — never all seven.
    const loaded = tracker.listLoadedSkills().sort()
    assert.deepEqual(loaded, ['campaign-strategy', 'marketing-strategy'])
  })

  it('rejects an unregistered skill id instead of reading arbitrary files', async () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps)
    await assert.rejects(() => tools.read_skill.execute({ skillId: '../../etc/passwd' }))
    await assert.rejects(() => tools.read_skill.execute({ skillId: 'video-scriptwriting' }))
  })
})

describe('create_or_version_deliverable', () => {
  it('creates a deliverable then appends an immutable version on revision', async () => {
    const fake = makeFakeDeliverableStore()
    const { deps } = makeDeps({ deliverables: fake.store })
    const tools = toolsFor(deps)

    const created = (await tools.create_or_version_deliverable.execute({
      title: 'Ramadan Strategy',
      type: 'general',
      content: 'Version one body.',
    })) as { deliverableId: string; version: number; created: boolean }
    assert.equal(created.created, true)
    assert.equal(created.version, 1)

    const revised = (await tools.create_or_version_deliverable.execute({
      deliverableId: created.deliverableId,
      expectedVersion: 1,
      title: 'Ramadan Strategy',
      type: 'general',
      content: 'Version two body.',
    })) as { version: number; created: boolean }
    assert.equal(revised.created, false)
    assert.equal(revised.version, 2)

    // Immutable history: v1 content is preserved, v2 appended.
    assert.deepEqual(fake.versions, [
      { deliverableId: created.deliverableId, version: 1, content: 'Version one body.' },
      { deliverableId: created.deliverableId, version: 2, content: 'Version two body.' },
    ])
    assert.equal(deps.runState.deliverables.length, 2)
  })

  it('is idempotent on create (same key returns the same deliverable)', async () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps)
    const a = (await tools.create_or_version_deliverable.execute({
      title: 'Plan',
      type: 'general',
      content: 'Body',
      idempotencyKey: 'key-1',
    })) as { deliverableId: string; created: boolean }
    const b = (await tools.create_or_version_deliverable.execute({
      title: 'Plan',
      type: 'general',
      content: 'Body',
      idempotencyKey: 'key-1',
    })) as { deliverableId: string; created: boolean }
    assert.equal(a.deliverableId, b.deliverableId)
    assert.equal(b.created, false)
  })

  it('treats model-invented slug strings as fresh creates instead of failing UUID lookup', async () => {
    const fake = makeFakeDeliverableStore()
    const { deps } = makeDeps({ deliverables: fake.store })
    const tools = toolsFor(deps)

    const created = (await tools.create_or_version_deliverable.execute({
      deliverableId: '3_FB_posts_نشر_مقترحات',
      title: '3 Facebook Posts',
      type: 'content_posts',
      content: 'Post body.',
    })) as { deliverableId: string; version: number; created: boolean }

    assert.equal(created.created, true)
    assert.equal(created.version, 1)
    assert.equal(fake.rows[0].id, 'del-1')
  })
})

describe('create_or_update_post_draft', () => {
  it('creates a draft with a proposed time and never schedules/publishes', async () => {
    const fake = makeFakeCalendarStore()
    const { deps } = makeDeps({ calendar: fake.store })
    const tools = toolsFor(deps)

    const created = (await tools.create_or_update_post_draft.execute({
      platform: 'facebook',
      caption: 'Ramadan offer 20% off.',
      proposedFor: '2026-03-01T18:00:00+02:00',
    })) as { postId: string; created: boolean; proposedFor: string | null }
    assert.equal(created.created, true)
    assert.equal(created.proposedFor, '2026-03-01T18:00:00+02:00')

    const row = fake.rows[0]
    assert.equal(row.status, 'draft')
    assert.equal(row.scheduled_for, null, 'a draft must never be scheduled')
    assert.notEqual(row.status, 'published')
    assert.equal(deps.runState.drafts.length, 1)
  })

  it('invalidates approval and appends an immutable version when the draft is revised', async () => {
    const fake = makeFakeCalendarStore()
    const { deps } = makeDeps({ calendar: fake.store })
    const tools = toolsFor(deps)

    const created = (await tools.create_or_update_post_draft.execute({
      platform: 'instagram',
      caption: 'First caption',
    })) as { postId: string; version: number }
    // Simulate a prior approval on v1.
    fake.rows[0].approval_state = 'approved'
    fake.rows[0].status = 'approved'

    const revised = (await tools.create_or_update_post_draft.execute({
      postId: created.postId,
      expectedVersion: created.version,
      platform: 'instagram',
      caption: 'Revised caption',
    })) as { version: number; created: boolean }
    assert.equal(revised.created, false)
    assert.equal(revised.version, 2)

    const row = fake.rows[0]
    assert.equal(row.approval_state, 'unapproved', 'revision invalidates a stale approval')
    assert.equal(row.status, 'draft')
    assert.equal(row.scheduled_for, null, 'revision never schedules')
    assert.deepEqual(fake.versions, [
      { postId: created.postId, revision: 1 },
      { postId: created.postId, revision: 2 },
    ])
  })

  it('drops non-ISO descriptive proposedFor strings and invented slug postIds', async () => {
    const fake = makeFakeCalendarStore()
    const { deps } = makeDeps({ calendar: fake.store })
    const tools = toolsFor(deps)

    const created = (await tools.create_or_update_post_draft.execute({
      postId: 'fb_post_slug_1',
      platform: 'facebook',
      caption: 'بوست تجريبي',
      proposedFor: 'الأربعاء 6-9 مساءً',
    })) as { postId: string; created: boolean; proposedFor: string | null }

    assert.equal(created.created, true)
    assert.equal(created.proposedFor, null)
    assert.equal(fake.rows[0].proposed_for, null)
  })
})

describe('delegate_agent', () => {
  it('validates the subtask and reports unavailability honestly for unbuilt specialists', async () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps)

    for (const role of ['research', 'content', 'marketing-analyst']) {
      const result = (await tools.delegate_agent.execute({ role, goal: 'Do the thing' })) as {
        status: string
        role: string
        message: string
      }
      assert.equal(result.status, 'unavailable')
      assert.equal(result.role, role)
      assert.equal(result.message, `Specialist ${role} is not enabled yet`)
    }
  })

  it('rejects an unknown specialist role via the schema', () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps)
    const parsed = tools.delegate_agent.inputSchema.safeParse({ role: 'designer', goal: 'x' })
    assert.equal(parsed.success, false)
  })
})

describe('workspace isolation', () => {
  it('rejects a model-supplied workspace mismatch', async () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps, 'ws-1')
    await assert.rejects(
      () => tools.read_deliverables.execute({ workspaceId: 'ws-2' }),
      (error: unknown) => error instanceof registry.ToolWorkspaceError,
    )
  })
})