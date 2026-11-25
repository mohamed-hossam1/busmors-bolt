import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { after, before, describe, it } from 'node:test'

// The review/revise/learning modules import `server-only`, which throws outside
// a Next.js Server Component. Stub it so these deterministic tests can import
// the real functions with zero live API calls.
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

type ReviewModule = typeof import('../../src/server/roadmap/review')
type ReviseModule = typeof import('../../src/server/roadmap/revise')
type LearningModule = typeof import('../../src/server/roadmap/learning')
type AiModelsModule = typeof import('../../src/config/ai-models')

let review: ReviewModule
let revise: ReviseModule
let learning: LearningModule
let aiModels: AiModelsModule

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-groq-key'
  process.env.DAHL_API_KEY = process.env.DAHL_API_KEY ?? 'test-dahl-key'
  const tag = '?roadmap-phase5-test=1'
  review = await import(`../../src/server/roadmap/review.ts${tag}`)
  revise = await import(`../../src/server/roadmap/revise.ts${tag}`)
  learning = await import(`../../src/server/roadmap/learning.ts${tag}`)
  aiModels = await import(`../../src/config/ai-models.ts${tag}`)
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

function makeEvaluation(overrides: Record<string, unknown> = {}) {
  return {
    assessment: 'Progress is steady against the plan.',
    recommendation: 'Continue',
    rationale: 'Actual results match expectations and no new blockers surfaced.',
    nextReviewDays: 7,
    ...overrides,
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
            dependencies: ['a1'],
            linkedMetric: null,
            evidence: [],
            uncertainty: '',
          },
        ],
      },
    ],
    risksAndAssumptions: [
      { kind: 'risk', statement: 'Margin data may be incomplete.', mitigation: 'Start with best available data.' },
    ],
    reviewCadence: { frequency: 'weekly', intervalDays: 7, rationale: 'Weekly check keeps spend honest.' },
    ...overrides,
  }
}

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    rationale: 'The owner wants to drop paid social and focus on referrals.',
    diff: {
      added: [{ key: 'a4', title: 'Launch referral ask', why: 'Referrals convert best.' }],
      removedOrPostponed: [{ key: 'a2', title: 'Paid social test', why: 'It failed.' }],
      modified: [{ key: 'a1', title: 'Define margin model', change: 'Add referral tracking', why: 'New focus.' }],
      summaryChanges: ['Primary objective now emphasises referrals.'],
    },
    proposedPlan: makePlan(),
    ...overrides,
  }
}

describe('CheckinEvaluationSchema (review)', () => {
  it('accepts each valid recommendation', () => {
    for (const recommendation of ['Continue', 'Adjust', 'Pause', 'Change direction'] as const) {
      const result = review.CheckinEvaluationSchema.safeParse(makeEvaluation({ recommendation }))
      assert.equal(result.success, true)
    }
  })

  it('rejects an unknown recommendation', () => {
    const result = review.CheckinEvaluationSchema.safeParse(makeEvaluation({ recommendation: 'Explode' }))
    assert.equal(result.success, false)
  })

  it('rejects an out-of-range nextReviewDays', () => {
    const result = review.CheckinEvaluationSchema.safeParse(makeEvaluation({ nextReviewDays: 0 }))
    assert.equal(result.success, false)
  })

  it('parses fenced JSON and throws on invalid JSON', () => {
    const fenced = '```json\n' + JSON.stringify(makeEvaluation()) + '\n```'
    assert.equal(review.parseCheckinEvaluation(fenced).recommendation, 'Continue')
    assert.throws(() => review.parseCheckinEvaluation('not json'), review.CheckinEvaluationValidationError)
  })
})

describe('evaluateCheckin (mocked, zero live calls)', () => {
  const baseInput = {
    workspaceId: '00000000-0000-0000-0000-000000000001',
    locale: 'en',
    goal: 'unprofitable_marketing',
    goalLabel: 'Unprofitable marketing',
    expectations: {
      objectiveTitle: 'Reach profitable growth',
      objectiveOutcome: 'Know which channels create contribution.',
      metrics: [{ name: 'Contribution margin', currentBaseline: 'unknown', target: '15%' }],
      reviewCadenceDays: 7,
    },
    completedSummary: 'Set up the margin sheet.',
    actualResults: '',
    whatDidntWork: 'Paid social underperformed.',
    blockers: '',
    businessChanges: '',
  }

  it('returns a validated evaluation and records one director model trace', async () => {
    const collector = makeCollector()
    const generateMock = async () => ({
      text: JSON.stringify(makeEvaluation()),
      provider: 'dahl',
      model: 'zai-org/GLM-5.3-Flash',
    })
    const result = await review.evaluateCheckin(baseInput, {
      generate: generateMock as never,
      collector: collector as never,
    })
    assert.equal(result.evaluation.recommendation, 'Continue')
    assert.equal(result.provider, 'dahl')
    assert.equal(collector.records.length, 1)
    assert.equal(collector.records[0].operation, 'roadmap_checkin')
  })

  it('never forces numbers: it accepts a purely qualitative check-in', async () => {
    const collector = makeCollector()
    let capturedPrompt = ''
    const generateMock = async (options: { prompt: string }) => {
      capturedPrompt = options.prompt
      return { text: JSON.stringify(makeEvaluation()), provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' }
    }
    await review.evaluateCheckin(
      { ...baseInput, actualResults: '', completedSummary: 'Just talking through it.' },
      { generate: generateMock as never, collector: collector as never },
    )
    assert.match(capturedPrompt, /actual results: \(not provided\)/i)
  })

  it('throws CheckinEvaluationValidationError on model validation failure', async () => {
    const collector = makeCollector()
    const generateMock = async () => ({ text: JSON.stringify({ nope: true }), provider: 'dahl', model: 'x' })
    await assert.rejects(
      review.evaluateCheckin(baseInput, { generate: generateMock as never, collector: collector as never }),
      review.CheckinEvaluationValidationError,
    )
    assert.equal(collector.records.some((record) => record.error !== undefined), true)
  })
})

describe('RevisionProposalSchema (revise)', () => {
  it('accepts a complete proposal with a diff and proposed plan', () => {
    const result = revise.RevisionProposalSchema.safeParse(makeProposal())
    assert.equal(result.success, true)
    const parsed = revise.RevisionProposalSchema.parse(makeProposal())
    assert.equal(parsed.diff.added.length, 1)
    assert.equal(parsed.diff.removedOrPostponed.length, 1)
    assert.equal(parsed.diff.modified.length, 1)
    assert.equal(parsed.proposedPlan.milestones.length, 2)
  })

  it('defaults missing diff arrays instead of failing', () => {
    const result = revise.RevisionProposalSchema.safeParse({
      rationale: 'x',
      diff: {},
      proposedPlan: makePlan(),
    })
    assert.equal(result.success, true)
    if (result.success) {
      assert.deepEqual(result.data.diff.added, [])
      assert.deepEqual(result.data.diff.summaryChanges, [])
    }
  })

  it('rejects a proposal missing the proposed plan', () => {
    const result = revise.RevisionProposalSchema.safeParse({ rationale: 'x', diff: {} })
    assert.equal(result.success, false)
  })

  it('parses fenced JSON and throws RevisionProposalValidationError on bad JSON', () => {
    const fenced = '```json\n' + JSON.stringify(makeProposal()) + '\n```'
    assert.equal(revise.parseRevisionProposal(fenced).proposedPlan.milestones.length, 2)
    assert.throws(() => revise.parseRevisionProposal('nope'), revise.RevisionProposalValidationError)
  })
})

describe('proposeRoadmapRevision (mocked, zero live calls)', () => {
  const baseInput = {
    workspaceId: '00000000-0000-0000-0000-000000000001',
    locale: 'en',
    goal: 'unprofitable_marketing',
    goalLabel: 'Unprofitable marketing',
    ownerRequest: 'Drop paid social, focus on referrals.',
    plan: {
      version: 2,
      objectiveTitle: 'Reach profitable growth',
      objectiveOutcome: 'Know which channels create contribution.',
      milestones: [{ key: 'ms1', title: 'Measure', actions: [{ key: 'a1', title: 'Define margin model' }] }],
    },
    checkins: [],
    brain: [{ id: '11111111-1111-1111-1111-111111111111', title: 'Margin', summary: 'No margin data', category: 'finance', version: 2 }],
  }

  it('returns a validated proposal and records one director model trace', async () => {
    const collector = makeCollector()
    const generateMock = async () => ({
      text: JSON.stringify(makeProposal()),
      provider: 'dahl',
      model: 'zai-org/GLM-5.3-Flash',
    })
    const result = await revise.proposeRoadmapRevision(baseInput, {
      generate: generateMock as never,
      collector: collector as never,
    })
    assert.equal(result.proposal.diff.added[0].key, 'a4')
    assert.equal(collector.records.length, 1)
    assert.equal(collector.records[0].operation, 'roadmap_revision')
  })

  it('includes the owner change request and current plan in the prompt', async () => {
    const collector = makeCollector()
    let capturedPrompt = ''
    const generateMock = async (options: { prompt: string }) => {
      capturedPrompt = options.prompt
      return { text: JSON.stringify(makeProposal()), provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' }
    }
    await revise.proposeRoadmapRevision(baseInput, { generate: generateMock as never, collector: collector as never })
    assert.match(capturedPrompt, /OWNER CHANGE REQUEST/)
    assert.match(capturedPrompt, /Drop paid social/)
    assert.match(capturedPrompt, /CURRENT ACTIVE PLAN/)
  })

  it('throws RevisionProposalValidationError on model validation failure', async () => {
    const collector = makeCollector()
    const generateMock = async () => ({ text: JSON.stringify({ nope: true }), provider: 'dahl', model: 'x' })
    await assert.rejects(
      revise.proposeRoadmapRevision(baseInput, { generate: generateMock as never, collector: collector as never }),
      revise.RevisionProposalValidationError,
    )
  })
})

describe('AI_MODE=test model allowlist (director)', () => {
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

describe('buildBrainProposalPayload (learning → Brain, never mutates brain_nodes)', () => {
  const entry = {
    id: '22222222-2222-2222-2222-222222222222',
    roadmap_id: '33333333-3333-3333-3333-333333333333',
    hypothesis: 'Referrals convert better than paid social.',
    experiment: 'Ran a two-week referral ask.',
    learning: 'Referred leads closed at a higher rate.',
    decision: 'Shift budget to referrals.',
  }

  it('maps to propose_brain_change with action=add and a null node id', () => {
    const payload = learning.buildBrainProposalPayload(entry, { category: 'audience', title: 'Referral audience', summary: 'Referred leads convert best.' })
    assert.equal(payload.p_action, 'add')
    assert.equal(payload.p_node_id, null)
    assert.equal(payload.p_category, 'audience')
    assert.equal(payload.p_title, 'Referral audience')
    assert.equal(payload.p_source, 'Roadmap Learning Log')
    assert.equal(payload.p_old_values, null)
    assert.equal(payload.p_new_values, null)
    assert.deepEqual(payload.p_source_refs, [
      { kind: 'roadmap_learning_log', id: entry.id, roadmapId: entry.roadmap_id },
    ])
  })

  it('never mutates brain_nodes: the payload carries no node write and is add-only', () => {
    const payload = learning.buildBrainProposalPayload(entry, {})
    // add-only + null node id means an existing brain_nodes row is never edited/deleted.
    assert.equal(payload.p_action, 'add')
    assert.equal(payload.p_node_id, null)
    // The payload keys are exactly the propose_brain_change RPC parameters.
    assert.deepEqual(Object.keys(payload).sort(), [
      'p_action',
      'p_category',
      'p_fingerprint',
      'p_new_values',
      'p_node_id',
      'p_old_values',
      'p_properties',
      'p_rationale',
      'p_source',
      'p_source_refs',
      'p_summary',
      'p_title',
    ])
  })

  it('falls back to the learning hypothesis/learning for title and summary', () => {
    const payload = learning.buildBrainProposalPayload(entry, {})
    assert.equal(payload.p_title, entry.hypothesis)
    assert.equal(payload.p_summary, entry.learning)
  })

  it('rejects an unknown category and defaults to company_fact', () => {
    const payload = learning.buildBrainProposalPayload(entry, { category: 'nonsense' })
    assert.equal(payload.p_category, 'company_fact')
    assert.equal(learning.isPromotableCategory('audience'), true)
    assert.equal(learning.isPromotableCategory('nonsense'), false)
  })

  it('produces a deterministic fingerprint for identical input', () => {
    const a = learning.buildBrainProposalPayload(entry, { category: 'audience', title: 'T', summary: 'S' })
    const b = learning.buildBrainProposalPayload(entry, { category: 'audience', title: 'T', summary: 'S' })
    assert.equal(a.p_fingerprint, b.p_fingerprint)
    assert.match(a.p_fingerprint, /^[0-9a-f]{64}$/)
  })
})

describe('migration contract (additive, RLS, explicit approval)', () => {
  const sql = readFileSync(
    new URL('../../supabase/migrations/20261125190000_roadmap_review_versioning_learning.sql', import.meta.url),
    'utf8',
  )

  it('enables row level security on every new table', () => {
    for (const table of ['roadmap_checkins', 'roadmap_revisions', 'roadmap_learning_log']) {
      assert.match(sql, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
    }
  })

  it('save_roadmap_revision_proposal only ever inserts a proposed revision (never applies)', () => {
    const body = sql.slice(sql.indexOf('FUNCTION save_roadmap_revision_proposal'), sql.indexOf('FUNCTION approve_roadmap_revision'))
    assert.match(body, /'proposed'/)
    // The proposal function must not archive versions or flip active_version_id.
    assert.doesNotMatch(body, /active_version_id\s*=/i)
    assert.doesNotMatch(body, /status\s*=\s*'archived'/i)
  })

  it('approve_roadmap_revision is a separate function that archives and creates a new version', () => {
    const body = sql.slice(sql.indexOf('FUNCTION approve_roadmap_revision'), sql.indexOf('FUNCTION reject_roadmap_revision'))
    assert.match(body, /status = 'archived'/i)
    assert.match(body, /active_version_id = new_v\.id/i)
    assert.match(body, /coalesce\(max\(version\), 0\) \+ 1/i)
  })

  it('revokes execute from public/anon and grants to authenticated for every RPC', () => {
    for (const fn of [
      'save_roadmap_checkin',
      'save_roadmap_revision_proposal',
      'approve_roadmap_revision',
      'reject_roadmap_revision',
      'create_learning_log_entry',
      'mark_learning_promoted',
    ]) {
      assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${fn}`))
      assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION ${fn}`))
    }
  })
})