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
} from '../../src/server/employee/director-store'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type { SkillLoader as SkillLoaderType } from '../../src/server/employee/skill-loader'

// The employee runtime transitively imports ai-models, which fails closed unless
// AI_MODE is set. Set it before the dynamic imports below (same pattern as
// director-tools.test.ts) so these deterministic tests make zero live API calls.
const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

let registry: typeof import('../../src/server/employee/tool-registry')
let contentTools: typeof import('../../src/server/employee/tools/content-tools')
let skillLoader: typeof import('../../src/server/employee/skill-loader')
let agentRuntime: typeof import('../../src/server/employee/agent-runtime')
let TaskGuardrailTracker: typeof agentRuntime.TaskGuardrailTracker

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?content-tools-test=1'
  registry = await import(`../../src/server/employee/tool-registry.ts${tag}`)
  contentTools = await import(`../../src/server/employee/tools/content-tools.ts${tag}`)
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

const TRACE_ID = '55555555-5555-4555-8555-555555555555'

type LooseTool = {
  inputSchema: { safeParse: (v: unknown) => { success: boolean } }
  execute: (input: unknown, options?: unknown) => Promise<unknown>
}
type LooseTools = Record<string, LooseTool>

type ContentToolDeps = import('../../src/server/employee/tools/content-tools').ContentToolDeps

function makeTracker(): ToolBudgetTracker & { recordToolUse: (name: string) => void } {
  return { canCallExternalTool: () => true, recordExternalToolCall: () => {}, recordToolUse: () => {} }
}

// ---- In-memory fakes ---------------------------------------------------------

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [],
    proposeChange: async () => ({ proposalId: 'p', status: 'pending', duplicate: false, conflict: false }),
  }
}

function makeFakeDeliverables(): DeliverableStore {
  return {
    createOrVersion: async (_input: CreateOrVersionDeliverableInput) => ({
      deliverableId: 'd',
      version: 1,
      created: true,
    }),
    readRecent: async () => [],
  }
}

function makeFakeCalendar(): CalendarStore {
  return {
    createOrUpdateDraft: async (_input: CreateOrUpdatePostDraftInput) => ({
      postId: 'p',
      version: 1,
      created: true,
      proposedFor: null,
    }),
    readDrafts: async () => [],
  }
}

let baseDir: string

async function writeSkill(role: string, id: string, description: string): Promise<void> {
  const dir = path.join(baseDir, role, id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${id}\ndescription: "${description}"\nmetadata:\n  version: "1.0.0"\n---\n\n# ${id}\n\nBody of ${id}.\n`,
    'utf8',
  )
}

before(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), 'busmora-content-'))
  await writeSkill('content', 'social-media-content', 'Social posts skill.')
  await writeSkill('content', 'conversion-copywriting', 'Conversion copy skill.')
  // Skills that belong to OTHER roles must never be readable by the Content Agent.
  await writeSkill('director', 'marketing-strategy', 'Director strategy skill.')
  await writeSkill('research', 'market-research', 'Research skill.')
})

after(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

function makeDeps(overrides: Partial<ContentToolDeps> = {}): {
  deps: ContentToolDeps
  tracker: InstanceType<typeof TaskGuardrailTracker>
} {
  const tracker = new TaskGuardrailTracker()
  const loader = new skillLoader.SkillLoader(baseDir) as SkillLoaderType
  const deps: ContentToolDeps = {
    brain: makeFakeBrain(),
    deliverables: makeFakeDeliverables(),
    calendar: makeFakeCalendar(),
    taskContext: {
      assignment: { goal: 'Write two Ramadan posts', outputLanguage: 'ar-EG' },
      priorDrafts: [],
    },
    loadSkill: (id) => loader.loadSkill('content', id, tracker),
    ...overrides,
  }
  return { deps, tracker }
}

function toolsFor(deps: ContentToolDeps, workspaceId = 'ws-1'): LooseTools {
  const reg = registry.createToolRegistry(contentTools.createContentToolDefinitions(deps))
  return registry.getToolsForRole('content', reg, {
    workspaceId,
    tracker: makeTracker(),
    traceId: TRACE_ID,
  }) as unknown as LooseTools
}

describe('content tool allowlist', () => {
  it('contains ONLY the five read-only tools and nothing else', () => {
    assert.deepEqual(
      [...registry.ROLE_TOOL_ALLOWLIST.content].sort(),
      ['get_task_context', 'read_business_brain', 'read_calendar', 'read_deliverables', 'read_skill'].sort(),
    )
    assert.deepEqual(
      [...registry.ROLE_TOOL_ALLOWLIST.content].sort(),
      [...contentTools.CONTENT_TOOL_NAMES].sort(),
    )

    const defs = contentTools.createContentToolDefinitions(makeDeps().deps)
    assert.deepEqual(defs.map((d) => d.name).sort(), [...contentTools.CONTENT_TOOL_NAMES].sort())
    // Every content tool is internal (read-only): zero external calls.
    assert.equal(defs.some((d) => d.external), false)
  })

  it('rejects publish/schedule/Brain-write/Deliverable-write/Calendar-write/web/delegate/clarification tools', () => {
    const names = registry.ROLE_TOOL_ALLOWLIST.content
    const forbidden = [
      'publish',
      'schedule',
      'propose_brain_change',
      'create_or_version_deliverable',
      'create_or_update_post_draft',
      'ask_clarification',
      'delegate_agent',
      'tavily_search',
      'exa_search',
      'firecrawl_scrape',
      'composio',
      'shell',
      'exec',
    ]
    for (const bad of forbidden) {
      assert.equal(
        names.some((n) => n === bad || n.includes(bad)),
        false,
        `content must NOT be granted "${bad}"`,
      )
    }
    // Exactly the three write/persistence verbs must be absent.
    assert.equal(names.includes('create_or_update_post_draft'), false)
    assert.equal(names.includes('propose_brain_change'), false)
  })

  it('grants only the allowlisted tools at dispatch (getToolsForRole)', () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps)
    assert.deepEqual(Object.keys(tools).sort(), [...contentTools.CONTENT_TOOL_NAMES].sort())
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

  it('also rejects a mismatch on read_calendar', async () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps, 'ws-1')
    await assert.rejects(
      () => tools.read_calendar.execute({ workspaceId: 'other' }),
      (error: unknown) => error instanceof registry.ToolWorkspaceError,
    )
  })
})

describe('lazy skill loading', () => {
  it('loads only the requested Content skill and deduplicates repeated reads', async () => {
    const { deps, tracker } = makeDeps()
    const tools = toolsFor(deps)

    const first = (await tools.read_skill.execute({ skillId: 'social-media-content' })) as {
      newlyLoaded: boolean
      content: string
    }
    assert.equal(first.newlyLoaded, true)
    assert.match(first.content, /social-media-content/)

    const second = (await tools.read_skill.execute({ skillId: 'social-media-content' })) as {
      newlyLoaded: boolean
    }
    assert.equal(second.newlyLoaded, false, 'a repeated read is deduplicated')

    await tools.read_skill.execute({ skillId: 'conversion-copywriting' })

    // Only the two explicitly requested skills were loaded — never all seven.
    const loaded = tracker.listLoadedSkills().sort()
    assert.deepEqual(loaded, ['conversion-copywriting', 'social-media-content'])
  })

  it('rejects unregistered ids, other-role skills and path traversal', async () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps)
    // Unregistered id.
    await assert.rejects(() => tools.read_skill.execute({ skillId: 'does-not-exist' }))
    // Director / research skills must not be readable by the Content Agent.
    await assert.rejects(() => tools.read_skill.execute({ skillId: 'marketing-strategy' }))
    await assert.rejects(() => tools.read_skill.execute({ skillId: 'market-research' }))
    // Path traversal.
    await assert.rejects(() => tools.read_skill.execute({ skillId: '../../etc/passwd' }))
    await assert.rejects(() => tools.read_skill.execute({ skillId: '..\\..\\secret' }))
  })
})

describe('get_task_context', () => {
  it('returns the bounded delegated brief and prior drafts (never chat history)', async () => {
    const { deps } = makeDeps({
      taskContext: {
        assignment: { goal: 'Adapt the Ramadan post to Instagram', outputLanguage: 'ar-EG' },
        priorDrafts: [
          {
            id: 'draft-1',
            itemType: 'post_draft',
            platform: 'facebook',
            title: 'Ramadan post',
            body: 'عرض رمضان',
            readiness: 'draft_ready',
            sourceRefs: [],
          },
        ],
        revisionFeedback: 'Make the CTA clearer.',
      },
    })
    const tools = toolsFor(deps)
    const ctx = (await tools.get_task_context.execute({})) as {
      assignment: { goal: string }
      priorDrafts: unknown[]
      revisionFeedback?: string
    }
    assert.equal(ctx.assignment.goal, 'Adapt the Ramadan post to Instagram')
    assert.equal(ctx.priorDrafts.length, 1)
    assert.equal(ctx.revisionFeedback, 'Make the CTA clearer.')
  })
})