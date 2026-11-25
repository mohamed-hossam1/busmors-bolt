import assert from 'node:assert/strict'
import { register } from 'node:module'
import { after, before, describe, it } from 'node:test'

// The generate module imports `server-only`, which throws outside a Next.js
// Server Component. Stub it so these deterministic tests can import the real
// functions with zero live API calls.
const serverOnlyStub =
  'data:text/javascript,' +
  encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'server-only') {
    return { url: 'data:text/javascript,export default {}', shortCircuit: true, format: 'module' }
  }
  return next(specifier, context)
}`)
register(serverOnlyStub)

const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

type GenerateModule = typeof import('../../src/server/roadmap/generate')
type AiModelsModule = typeof import('../../src/config/ai-models')

let generate: GenerateModule
let aiModels: AiModelsModule

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-groq-key'
  process.env.DAHL_API_KEY = process.env.DAHL_API_KEY ?? 'test-dahl-key'
  const generatePath = '../../src/server/roadmap/generate.ts?roadmap-generate-test=1'
  const aiModelsPath = '../../src/config/ai-models.ts?roadmap-generate-test=1'
  generate = await import(generatePath)
  aiModels = await import(aiModelsPath)
})

after(() => {
  if (originalEnv.AI_MODE === undefined) delete process.env.AI_MODE
  else process.env.AI_MODE = originalEnv.AI_MODE
  if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY
  if (originalEnv.DAHL_API_KEY === undefined) delete process.env.DAHL_API_KEY
  else process.env.DAHL_API_KEY = originalEnv.DAHL_API_KEY
})

interface MockCollector {
  records: Array<Record<string, unknown>>
  recordModel: (record: Record<string, unknown>) => void
  flush: () => void
}

function makeCollector(): MockCollector {
  const records: Array<Record<string, unknown>> = []
  return {
    records,
    recordModel: (record) => {
      records.push(record)
    },
    flush: () => {},
  }
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    diagnosis: {
      perceivedProblem: 'Owners cannot tell which marketing is profitable.',
      rootDiagnosis: 'No per-channel margin tracking exists.',
      supportingEvidence: ['Owner reported no margin dashboard.'],
      hypotheses: ['ROAS is being mistaken for profit.'],
      unknowns: ['True contribution margin per channel.'],
    },
    primaryObjective: {
      title: 'Reach profitable growth',
      outcome: 'Know which channels create contribution, not just revenue.',
      proposedTarget: '+15% contribution margin',
      isProposedTarget: true,
    },
    metrics: [
      {
        key: 'm1',
        name: 'Contribution margin',
        currentBaseline: 'unknown',
        target: '15%',
        isProposedTarget: true,
        measurementMethod: 'Margin report per channel',
        reviewTiming: 'Weekly',
      },
    ],
    priorities: {
      focusFirst: [{ title: 'Instrument margin', why: 'Cannot optimise what is not measured.' }],
      intentionallyDeferred: [{ title: 'New channels', why: 'Fix measurement first.' }],
    },
    milestones: [
      {
        key: 'ms1',
        title: 'Measure',
        description: 'Set up margin tracking.',
        sequenceLabel: 'Phase 1',
        actions: [
          {
            key: 'a1',
            title: 'Define margin model',
            description: 'Define contribution margin fields.',
            businessRationale: 'Profit, not ROAS, is the goal.',
            responsibleParty: 'owner',
            actionKind: 'owner_execution',
            priority: 'high',
            expectedOutput: 'A margin definition sheet',
            successCriteria: 'Owner confirms the fields',
            dependencies: [],
            linkedMetric: 'm1',
            evidence: ['Owner interview'],
            uncertainty: 'Data availability unknown',
          },
          {
            key: 'a2',
            title: 'Build report',
            description: 'Marketing Director drafts the report.',
            businessRationale: 'Centralise measurement.',
            responsibleParty: 'director',
            actionKind: 'analysis',
            priority: 'medium',
            expectedOutput: 'Draft margin report',
            successCriteria: 'Report reconciles to sales',
            dependencies: ['a1'],
            linkedMetric: 'm1',
            evidence: [],
            uncertainty: '',
          },
        ],
      },
      {
        key: 'ms2',
        title: 'Act',
        description: 'Reallocate spend to contribution.',
        sequenceLabel: 'Phase 2',
        actions: [
          {
            key: 'a3',
            title: 'Reallocate budget',
            description: 'Joint decision on budget shift.',
            businessRationale: 'Move spend toward profit.',
            responsibleParty: 'joint',
            actionKind: 'joint',
            priority: 'high',
            expectedOutput: 'New budget allocation',
            successCriteria: 'Contribution improves',
            dependencies: ['a2'],
            linkedMetric: null,
            evidence: [],
            uncertainty: '',
          },
        ],
      },
    ],
    risksAndAssumptions: [
      { kind: 'risk', statement: 'Margin data may be incomplete.', mitigation: 'Start with best available data.' },
      { kind: 'assumption', statement: 'Owner can export sales data.', mitigation: 'Confirm access early.' },
    ],
    reviewCadence: { frequency: 'weekly', intervalDays: 7, rationale: 'Weekly check keeps spend honest.' },
    ...overrides,
  }
}

describe('GeneratedRoadmapSchema', () => {
  it('accepts a complete, well-formed plan', () => {
    const result = generate.GeneratedRoadmapSchema.safeParse(makePlan())
    assert.equal(result.success, true)
  })

  it('preserves fact / hypothesis / unknown separation', () => {
    const parsed = generate.GeneratedRoadmapSchema.parse(makePlan())
    assert.deepEqual(parsed.diagnosis.supportingEvidence, ['Owner reported no margin dashboard.'])
    assert.deepEqual(parsed.diagnosis.hypotheses, ['ROAS is being mistaken for profit.'])
    assert.deepEqual(parsed.diagnosis.unknowns, ['True contribution margin per channel.'])
  })

  it('preserves an "unknown" baseline instead of fabricating a number', () => {
    const parsed = generate.GeneratedRoadmapSchema.parse(makePlan())
    assert.equal(parsed.metrics[0].currentBaseline, 'unknown')
  })

  it('preserves the isProposedTarget flag on objective and metric', () => {
    const parsed = generate.GeneratedRoadmapSchema.parse(makePlan())
    assert.equal(parsed.primaryObjective.isProposedTarget, true)
    assert.equal(parsed.metrics[0].isProposedTarget, true)
  })

  it('rejects a plan with fewer than two milestones', () => {
    const plan = makePlan()
    const result = generate.GeneratedRoadmapSchema.safeParse({ ...plan, milestones: plan.milestones.slice(0, 1) })
    assert.equal(result.success, false)
  })

  it('rejects a plan missing the diagnosis', () => {
    const plan = makePlan() as Record<string, unknown>
    delete plan.diagnosis
    const result = generate.GeneratedRoadmapSchema.safeParse(plan)
    assert.equal(result.success, false)
  })

  it('rejects an out-of-range review interval', () => {
    const plan = makePlan()
    const result = generate.GeneratedRoadmapSchema.safeParse({
      ...plan,
      reviewCadence: { frequency: 'weekly', intervalDays: 0, rationale: 'x' },
    })
    assert.equal(result.success, false)
  })
})

describe('parseGeneratedRoadmap', () => {
  it('parses fenced JSON', () => {
    const fenced = '```json\n' + JSON.stringify(makePlan()) + '\n```'
    const parsed = generate.parseGeneratedRoadmap(fenced)
    assert.equal(parsed.milestones.length, 2)
  })

  it('throws RoadmapGenerationValidationError on invalid JSON', () => {
    assert.throws(() => generate.parseGeneratedRoadmap('not json'), generate.RoadmapGenerationValidationError)
  })
})

describe('generateRoadmapPlan (mocked, zero live calls)', () => {
  const baseInput = {
    workspaceId: '00000000-0000-0000-0000-000000000001',
    locale: 'en',
    goal: 'unprofitable_marketing',
    goalLabel: 'Unprofitable marketing',
    answers: [{ questionKey: 'um_leak', label: 'Where is the leak?', status: 'answered', answer: 'Paid social' }],
    openUnknowns: ['True margin per channel', 'Repeat purchase rate'],
    brain: [{ id: '11111111-1111-1111-1111-111111111111', title: 'Margin', summary: 'No margin data', category: 'finance', version: 2 }],
    deliverables: [],
    priorLearnings: [],
  }

  it('returns a validated plan and records one model trace with partial answers', async () => {
    const collector = makeCollector()
    const generateMock = async () => ({
      text: JSON.stringify(makePlan()),
      provider: 'dahl',
      model: 'zai-org/GLM-5.3-Flash',
    })
    const result = await generate.generateRoadmapPlan(baseInput, {
      generate: generateMock as never,
      collector: collector as never,
    })
    assert.equal(result.plan.milestones.length, 2)
    assert.equal(result.provider, 'dahl')
    assert.equal(result.usedBrainNodes.length, 1)
    assert.equal(collector.records.length, 1)
    assert.equal(collector.records[0].operation, 'roadmap_generate')
  })

  it('includes the profit-vs-ROAS guardrail in the prompt for unprofitable_marketing', async () => {
    const collector = makeCollector()
    let capturedPrompt = ''
    const generateMock = async (options: { prompt: string }) => {
      capturedPrompt = options.prompt
      return { text: JSON.stringify(makePlan()), provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' }
    }
    await generate.generateRoadmapPlan(baseInput, {
      generate: generateMock as never,
      collector: collector as never,
    })
    assert.match(capturedPrompt, /ROAS/)
    assert.match(capturedPrompt, /profit/i)
    assert.match(capturedPrompt, /OPEN UNKNOWNS/)
    assert.match(capturedPrompt, /True margin per channel/)
  })

  it('throws RoadmapGenerationValidationError on model validation failure', async () => {
    const collector = makeCollector()
    const generateMock = async () => ({ text: JSON.stringify({ nope: true }), provider: 'dahl', model: 'x' })
    await assert.rejects(
      generate.generateRoadmapPlan(baseInput, { generate: generateMock as never, collector: collector as never }),
      generate.RoadmapGenerationValidationError,
    )
    assert.equal(collector.records.some((record) => record.error !== undefined), true)
  })
})

describe('buildRoadmapPersistencePayload', () => {
  it('flattens milestones/actions into roadmap_steps with the responsibility mapping', () => {
    const plan = generate.GeneratedRoadmapSchema.parse(makePlan())
    const usedBrainNodes = [
      { id: '11111111-1111-1111-1111-111111111111', title: 'Margin', summary: 's', category: 'finance', version: 3 },
    ]
    const payload = generate.buildRoadmapPersistencePayload(plan, usedBrainNodes)

    // 2 + 1 actions across 2 milestones.
    assert.equal(payload.steps.length, 3)
    assert.deepEqual(payload.steps.map((step) => step.position), [0, 1, 2])

    const ownerStep = payload.steps.find((step) => step.stepKey === 'a1')
    assert.ok(ownerStep)
    assert.equal(ownerStep.responsibility, 'owner')
    assert.equal(ownerStep.executionMode, 'owner')
    assert.equal(ownerStep.ownerRole, 'owner')
    assert.equal(ownerStep.actionKind, 'owner_execution')
    assert.equal(ownerStep.milestoneKey, 'ms1')
    assert.equal(ownerStep.milestonePosition, 0)
    assert.equal(ownerStep.linkedMetric, 'm1')

    const directorStep = payload.steps.find((step) => step.stepKey === 'a2')
    assert.ok(directorStep)
    assert.equal(directorStep.responsibility, 'system')
    assert.equal(directorStep.executionMode, 'director')
    assert.equal(directorStep.ownerRole, 'director')

    const jointStep = payload.steps.find((step) => step.stepKey === 'a3')
    assert.ok(jointStep)
    // 'joint' maps onto the system/director pair, keeping owner_role = 'joint'.
    assert.equal(jointStep.responsibility, 'system')
    assert.equal(jointStep.executionMode, 'director')
    assert.equal(jointStep.ownerRole, 'joint')
    assert.equal(jointStep.milestoneKey, 'ms2')
  })

  it('extracts context dependency refs from used brain nodes', () => {
    const plan = generate.GeneratedRoadmapSchema.parse(makePlan())
    const payload = generate.buildRoadmapPersistencePayload(plan, [
      { id: '11111111-1111-1111-1111-111111111111', title: 'A', summary: '', category: 'x', version: 4 },
      { id: '22222222-2222-2222-2222-222222222222', title: 'B', summary: '', category: 'y', version: 1 },
    ])
    assert.deepEqual(payload.contextRefs, [
      { nodeId: '11111111-1111-1111-1111-111111111111', nodeVersion: 4 },
      { nodeId: '22222222-2222-2222-2222-222222222222', nodeVersion: 1 },
    ])
    assert.equal(payload.summary.milestones.length, 2)
  })
})

describe('AI_MODE=test model allowlist', () => {
  it('only allows the configured test models', () => {
    assert.equal(aiModels.AI_MODE, 'test')
    for (const allowed of aiModels.TEST_ALLOWED_MODELS) {
      assert.equal(aiModels.isModelAllowed(allowed.provider, allowed.model), true)
    }
    assert.equal(aiModels.isModelAllowed('groq', 'some-other-model'), false)
  })

  it('director role chain in test mode only uses allowed models', () => {
    const chain = aiModels.getRoleModelChain('director')
    assert.ok(chain.length > 0)
    for (const target of chain) {
      assert.equal(aiModels.isModelAllowed(target.provider, target.model), true)
    }
  })
})