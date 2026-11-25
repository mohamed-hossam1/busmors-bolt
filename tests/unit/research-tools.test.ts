import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import type { ToolBudgetTracker } from '../../src/server/employee/tool-registry'
import type { BrainStore } from '../../src/server/employee/brain-store'
import type { DeliverableStore } from '../../src/server/employee/director-store'
import type { SkillLoader as SkillLoaderType } from '../../src/server/employee/skill-loader'
import type { ResearchTaskContext } from '../../src/server/employee/tools/research-tools'

// The employee runtime transitively imports ai-models, which fails closed unless
// AI_MODE is set. Set it before the dynamic imports below so these deterministic
// tests make zero live API calls (same pattern as director-tools.test.ts).
const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

let registry: typeof import('../../src/server/employee/tool-registry')
let researchTools: typeof import('../../src/server/employee/tools/research-tools')
let skillLoader: typeof import('../../src/server/employee/skill-loader')
let agentRuntime: typeof import('../../src/server/employee/agent-runtime')
let TaskGuardrailTracker: typeof agentRuntime.TaskGuardrailTracker

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  const tag = '?research-tools-test=1'
  registry = await import(`../../src/server/employee/tool-registry.ts${tag}`)
  researchTools = await import(`../../src/server/employee/tools/research-tools.ts${tag}`)
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

const TRACE_ID = '77777777-7777-4777-8777-777777777777'

type LooseTool = {
  inputSchema: { safeParse: (v: unknown) => { success: boolean } }
  execute: (input: unknown, options?: unknown) => Promise<unknown>
}
type LooseTools = Record<string, LooseTool>

type ResearchToolDeps = import('../../src/server/employee/tools/research-tools').ResearchToolDeps

function makeTracker(): ToolBudgetTracker & { recordToolUse: (name: string) => void } {
  return { canCallExternalTool: () => true, recordExternalToolCall: () => {}, recordToolUse: () => {} }
}

function makeFakeBrain(): BrainStore {
  return {
    readApproved: async () => [
      {
        id: 'node-1',
        category: 'company_profile',
        title: 'Acme Bakery',
        summary: 'A neighborhood bakery in Cairo.',
        properties: {},
        version: 1,
        source: 'manual',
        sourceDetail: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    proposeChange: async () => ({ proposalId: 'p', status: 'pending', duplicate: false, conflict: false }),
  }
}

function makeFakeDeliverables(): DeliverableStore {
  return {
    createOrVersion: async () => ({ deliverableId: 'd', version: 1, created: true }),
    readRecent: async () => [{ id: 'del-1', title: 'Prior report', type: 'research_report', version: 1, created_at: '' }],
  }
}

function makeTaskContext(overrides: Partial<ResearchTaskContext> = {}): ResearchTaskContext {
  return {
    assignment: { goal: 'Check Cairo bakery competitors', scope: 'Cairo', outputLanguage: 'ar' },
    priorFindings: [],
    priorSources: [],
    ...overrides,
  }
}

let baseDir: string

async function writeSkill(id: string, description: string): Promise<void> {
  const dir = path.join(baseDir, 'research', id)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${id}\ndescription: "${description}"\nmetadata:\n  version: "1.0.0"\n---\n\n# ${id}\n\nBody of ${id}.\n`,
    'utf8',
  )
}

before(async () => {
  baseDir = await mkdtemp(path.join(tmpdir(), 'busmora-research-'))
  await writeSkill('market-research', 'Market research skill.')
  await writeSkill('competitor-intelligence', 'Competitor skill.')
})

after(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

function makeDeps(overrides: Partial<ResearchToolDeps> = {}): {
  deps: ResearchToolDeps
  tracker: InstanceType<typeof TaskGuardrailTracker>
} {
  const tracker = new TaskGuardrailTracker()
  const loader = new skillLoader.SkillLoader(baseDir) as SkillLoaderType
  const deps: ResearchToolDeps = {
    brain: makeFakeBrain(),
    deliverables: makeFakeDeliverables(),
    taskContext: makeTaskContext(),
    loadSkill: (id) => loader.loadSkill('research', id, tracker),
    ...overrides,
  }
  return { deps, tracker }
}

function toolsFor(deps: ResearchToolDeps, workspaceId = 'ws-1'): LooseTools {
  const reg = registry.createToolRegistry(researchTools.createResearchToolDefinitions(deps))
  return registry.getToolsForRole('research', reg, {
    workspaceId,
    tracker: new TaskGuardrailTracker(),
    traceId: TRACE_ID,
  }) as unknown as LooseTools
}

describe('research tool allowlist', () => {
  it('contains exactly the 7 read-only spec tools, only the 3 web tools external', () => {
    const allowlist = registry.ROLE_TOOL_ALLOWLIST.research
    assert.deepEqual([...allowlist].sort(), [...researchTools.RESEARCH_TOOL_NAMES].sort())

    const defs = researchTools.createResearchToolDefinitions(makeDeps().deps)
    assert.deepEqual(defs.map((d) => d.name).sort(), [...researchTools.RESEARCH_TOOL_NAMES].sort())

    const external = defs.filter((d) => d.external).map((d) => d.name).sort()
    assert.deepEqual(external, ['exa_search', 'firecrawl_scrape', 'tavily_search'])
  })

  it('grants no Calendar, Brain/Deliverable writes, publishing, or specialist calls', () => {
    const names = registry.ROLE_TOOL_ALLOWLIST.research
    for (const forbidden of [
      'read_calendar',
      'create_or_version_deliverable',
      'create_or_update_post_draft',
      'propose_brain_change',
      'delegate_agent',
      'publish',
      'schedule',
      'composio',
      'shell',
    ]) {
      assert.equal(
        names.some((n) => n === forbidden || n.includes(forbidden)),
        false,
        `research must not be granted "${forbidden}"`,
      )
    }
  })

  it('exposes only the research role tools (no director tools leak in)', () => {
    const tools = toolsFor(makeDeps().deps)
    assert.deepEqual(Object.keys(tools).sort(), [...researchTools.RESEARCH_TOOL_NAMES].sort())
  })
})

describe('lazy skill loading', () => {
  it('loads only the requested Research skill and deduplicates repeated reads', async () => {
    const { deps, tracker } = makeDeps()
    const tools = toolsFor(deps)

    const first = (await tools.read_skill.execute({ skillId: 'market-research' })) as {
      newlyLoaded: boolean
      content: string
    }
    assert.equal(first.newlyLoaded, true)
    assert.match(first.content, /market-research/)

    const second = (await tools.read_skill.execute({ skillId: 'market-research' })) as { newlyLoaded: boolean }
    assert.equal(second.newlyLoaded, false, 'a repeated read is deduplicated')

    await tools.read_skill.execute({ skillId: 'competitor-intelligence' })

    // Only the two explicitly requested skills were loaded — never all five.
    assert.deepEqual(tracker.listLoadedSkills().sort(), ['competitor-intelligence', 'market-research'])
  })

  it('rejects an unregistered or cross-role skill id instead of reading arbitrary files', async () => {
    const { deps } = makeDeps()
    const tools = toolsFor(deps)
    await assert.rejects(() => tools.read_skill.execute({ skillId: '../../etc/passwd' }))
    await assert.rejects(() => tools.read_skill.execute({ skillId: 'marketing-strategy' }))
  })
})

describe('get_task_context', () => {
  it('returns the bounded delegated scope and prior findings, not conversation history', async () => {
    const prior = makeTaskContext({
      priorFindings: [{ claim: 'Prior fact', label: 'observed_fact', sourceUrls: [] }],
    })
    const { deps } = makeDeps({ taskContext: prior })
    const tools = toolsFor(deps)

    const context = (await tools.get_task_context.execute({})) as ResearchTaskContext
    assert.equal(context.assignment.goal, 'Check Cairo bakery competitors')
    assert.equal(context.priorFindings[0].claim, 'Prior fact')
    assert.equal('messages' in context, false)
    assert.equal('conversation' in context, false)
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