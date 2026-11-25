import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ROLE_TOOL_ALLOWLIST,
  createToolRegistry,
  getToolsForRole,
  ToolWorkspaceError,
  type ToolBudgetTracker,
} from '../../src/server/employee/tool-registry'
import {
  createOrchestratorToolDefinitions,
  validateDirectorHandoff,
  ORCHESTRATOR_TOOL_NAMES,
} from '../../src/server/employee/tools/orchestrator-tools'
import type { BrainStore, ProposeBrainChangeInput } from '../../src/server/employee/brain-store'

const TRACE_ID = '22222222-2222-4222-8222-222222222222'

function makeTracker(): ToolBudgetTracker & { recordToolUse: (name: string) => void } {
  return {
    canCallExternalTool: () => true,
    recordExternalToolCall: () => {},
    recordToolUse: () => {},
  }
}

interface FakeBrain {
  store: BrainStore
  calls: { read: number; propose: ProposeBrainChangeInput[] }
}

function makeFakeBrain(): FakeBrain {
  const calls: FakeBrain['calls'] = { read: 0, propose: [] }
  const store: BrainStore = {
    readApproved: async () => {
      calls.read += 1
      return [
        {
          id: 'node-1',
          category: 'company_profile',
          title: 'Acme Bakery',
          summary: 'A neighborhood bakery in Cairo.',
          properties: {},
          version: 3,
          source: 'manual',
          sourceDetail: null,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]
    },
    proposeChange: async (input) => {
      calls.propose.push(input)
      return {
        proposalId: 'proposal-1',
        status: 'pending',
        duplicate: false,
        conflict: false,
        baseVersion: input.action === 'add' ? 0 : 3,
      }
    },
  }
  // The store intentionally exposes no approve/apply capability.
  return { store, calls }
}

type LooseTool = { execute: (input: unknown, options?: unknown) => Promise<unknown> }
type LooseTools = Record<string, LooseTool>

function toolsFor(brain: BrainStore, workspaceId = 'ws-1'): LooseTools {
  const registry = createToolRegistry(createOrchestratorToolDefinitions({ brain }))
  return getToolsForRole('orchestrator', registry, {
    workspaceId,
    tracker: makeTracker(),
    traceId: TRACE_ID,
  }) as unknown as LooseTools
}

describe('orchestrator tool allowlist', () => {
  it('contains ONLY the 3 internal tools (no external tools, no skills)', () => {
    const allowlist = ROLE_TOOL_ALLOWLIST.orchestrator
    assert.equal(allowlist.length, 3)
    assert.deepEqual([...allowlist].sort(), [...ORCHESTRATOR_TOOL_NAMES].sort())

    const defs = createOrchestratorToolDefinitions({ brain: makeFakeBrain().store })
    assert.deepEqual(defs.map((d) => d.name).sort(), [...ORCHESTRATOR_TOOL_NAMES].sort())
    for (const def of defs) {
      assert.equal(def.external, false, `${def.name} must be an internal tool`)
    }
  })
})

describe('propose_brain_change', () => {
  it('creates a pending proposal and never mutates approved facts', async () => {
    const { store, calls } = makeFakeBrain()
    const tools = toolsFor(store)

    const result = (await tools.propose_brain_change.execute({
      action: 'edit',
      nodeId: 'node-1',
      title: 'Acme Bakery',
      summary: 'Updated summary.',
      category: 'company_profile',
      oldValues: { summary: 'A neighborhood bakery in Cairo.' },
      newValues: { summary: 'Updated summary.' },
      source: 'conversation',
      rationale: 'Owner asked to update the summary.',
    })) as { status: string; proposalId: string }

    assert.equal(result.status, 'pending')
    assert.equal(result.proposalId, 'proposal-1')
    assert.equal(calls.propose.length, 1)
    assert.equal(calls.propose[0].action, 'edit')
    assert.equal(calls.read, 0, 'proposing must not re-read/approve facts')
    // The store has no approve/apply surface at all.
    assert.equal('approve' in (store as unknown as Record<string, unknown>), false)
    assert.equal('apply' in (store as unknown as Record<string, unknown>), false)
  })
})

describe('delegate_to_director', () => {
  it('validates the handoff (preserving language, context, unapproved facts) and reports unavailability honestly', async () => {
    const { store } = makeFakeBrain()
    const tools = toolsFor(store)

    const handoff = {
      originalRequest: 'Write a Ramadan campaign for my bakery.',
      intendedOutcome: 'A 3-post campaign plan with captions.',
      outputLanguage: 'ar',
      context: 'Audience is families in Cairo.',
      constraints: 'No discounts above 20%.',
      taskReferences: ['task-42'],
      unapprovedFacts: [{ fact: 'New branch opens in Nasr City.', status: 'unapproved' as const }],
    }

    const validated = validateDirectorHandoff(handoff)
    assert.equal(validated.ok, true)
    if (validated.ok) {
      assert.equal(validated.value.outputLanguage, 'ar')
      assert.equal(validated.value.context, handoff.context)
      assert.deepEqual(validated.value.unapprovedFacts, handoff.unapprovedFacts)
    }

    const result = (await tools.delegate_to_director.execute(handoff)) as {
      status: string
      message: string
    }
    assert.equal(result.status, 'unavailable')
    assert.equal(result.message, 'Director is not enabled yet')
  })

  it('rejects an invalid handoff instead of simulating execution', async () => {
    const { store } = makeFakeBrain()
    const tools = toolsFor(store)

    const invalid = validateDirectorHandoff({ intendedOutcome: 'x', outputLanguage: 'en' })
    assert.equal(invalid.ok, false)

    const result = (await tools.delegate_to_director.execute({
      intendedOutcome: 'x',
      outputLanguage: 'en',
    })) as { status: string }
    assert.equal(result.status, 'error')
  })
})

describe('workspace isolation', () => {
  it('rejects a model-supplied workspace mismatch and reads only the session workspace', async () => {
    const { store, calls } = makeFakeBrain()
    const tools = toolsFor(store, 'ws-1')

    await assert.rejects(
      () => tools.read_business_brain.execute({ workspaceId: 'ws-2' }),
      (error: unknown) => error instanceof ToolWorkspaceError,
    )
    assert.equal(calls.read, 0, 'a rejected cross-workspace read must not hit the store')

    const result = (await tools.read_business_brain.execute({ query: 'bakery' })) as {
      facts: unknown[]
    }
    assert.equal(result.facts.length, 1)
    assert.equal(calls.read, 1)
  })
})