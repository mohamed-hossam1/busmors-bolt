import assert from 'node:assert/strict'
import { register } from 'node:module'
import { after, before, describe, it } from 'node:test'
import {
  DISCOVERY_GOALS,
  DISCOVERY_QUESTIONS,
  OTHER_OPTION_VALUE,
  buildDiscoveryPlan,
  normalizeGoal,
} from '../../src/features/roadmap/discovery'
import { isOwnerConfirmed, mergePrefillSuggestions } from '../../src/features/roadmap/prefill-merge'
import type { PrefillSuggestion } from '../../src/features/roadmap/types'

// The server prefill module imports `server-only`, which throws outside a
// Next.js Server Component. Register a resolve hook that stubs it to an empty
// module so these deterministic tests can import the real functions with zero
// live API calls (same spirit as the other server-side unit tests).
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

// The prefill module transitively imports ai-models, which fails closed unless
// AI_MODE is set. Set it before the dynamic imports below so no live calls run.
const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
}

type PrefillModule = typeof import('../../src/server/roadmap/prefill')
type AiModelsModule = typeof import('../../src/config/ai-models')

let prefill: PrefillModule
let aiModels: AiModelsModule

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-groq-key'
  process.env.DAHL_API_KEY = process.env.DAHL_API_KEY ?? 'test-dahl-key'
  const prefillPath = '../../src/server/roadmap/prefill.ts?roadmap-discovery-test=1'
  const aiModelsPath = '../../src/config/ai-models.ts?roadmap-discovery-test=1'
  prefill = await import(prefillPath)
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

const EXPECTED_DIRECTOR_ELIGIBILITY: Record<string, boolean> = {
  vi_problem: true,
  vi_customer: true,
  vi_alternatives: true,
  vi_spoken: false,
  vi_pay: false,
  vi_geo: true,
  wfc_selling: true,
  wfc_ready: true,
  wfc_hear: true,
  wfc_inquiries: false,
  wfc_blocker: true,
  wfc_channels: true,
  gc_count: false,
  gc_source: false,
  gc_growth: false,
  gc_best: true,
  gc_prevent: true,
  gc_goal: true,
  ci_where: false,
  ci_volume: false,
  ci_response: false,
  ci_percent: false,
  ci_objection: true,
  ci_followup: false,
  um_channels: false,
  um_spend: false,
  um_margin: false,
  um_aov: false,
  um_measure: false,
  um_repeat: false,
  um_leak: true,
  lo_what: true,
  lo_audience: true,
  lo_standout: true,
  lo_when: false,
  lo_channels: true,
  lo_goal: true,
  irr_frequency: false,
  irr_why_return: true,
  irr_why_not: true,
  irr_list: false,
  irr_feedback: false,
  irr_easiest: true,
  se_stage: false,
  se_symptom: false,
  se_channel: false,
  se_numbers: false,
  se_satisfied: false,
  se_improve: true,
}

describe('Discovery challenge cards', () => {
  it('exposes exactly 8 challenge cards with stable goal keys', () => {
    assert.equal(DISCOVERY_GOALS.length, 8)
    assert.deepEqual(
      DISCOVERY_GOALS.map((goal) => goal.value),
      [
        'validate_idea',
        'win_first_customers',
        'grow_customers',
        'convert_inquiries',
        'unprofitable_marketing',
        'launch_offer',
        'increase_repeat_referral',
        'something_else',
      ],
    )
  })

  it('normalizeGoal maps legacy keys to current challenge keys', () => {
    assert.equal(normalizeGoal('acquire_first_customers'), 'win_first_customers')
    assert.equal(normalizeGoal('repeat_referral'), 'increase_repeat_referral')
    assert.equal(normalizeGoal('custom'), 'something_else')
    // Current keys pass through unchanged.
    assert.equal(normalizeGoal('validate_idea'), 'validate_idea')
    assert.equal(normalizeGoal('increase_repeat_referral'), 'increase_repeat_referral')
    // Unknown keys fall back to something_else.
    assert.equal(normalizeGoal('not_a_real_goal'), 'something_else')
  })
})

describe('DISCOVERY_QUESTIONS configuration', () => {
  it('defines 6-7 fixed questions for every challenge', () => {
    for (const goal of DISCOVERY_GOALS) {
      const questions = DISCOVERY_QUESTIONS[goal.value]
      assert.ok(
        questions.length >= 6 && questions.length <= 7,
        `${goal.value} should have 6-7 questions, got ${questions.length}`,
      )
    }
  })

  it('buildDiscoveryPlan marks every question allowOther with an __other__ option', () => {
    for (const goal of DISCOVERY_GOALS) {
      const plan = buildDiscoveryPlan({ goal: goal.value, hasWebsite: true, facts: [], locale: 'en' })
      assert.equal(plan.length, DISCOVERY_QUESTIONS[goal.value].length)
      for (const item of plan) {
        assert.equal(item.schema.allowOther, true, `${item.question_key} must allow other`)
        const hasOther = item.schema.options?.some((option) => option.value === OTHER_OPTION_VALUE)
        assert.ok(hasOther, `${item.question_key} must include the __other__ option`)
      }
    }
  })

  it('askDirectorEligible flags match Section 2.2 (internal numbers false, advisory true)', () => {
    for (const goal of DISCOVERY_GOALS) {
      for (const def of DISCOVERY_QUESTIONS[goal.value]) {
        const expected = EXPECTED_DIRECTOR_ELIGIBILITY[def.key]
        assert.equal(typeof expected, 'boolean', `missing expectation for ${def.key}`)
        assert.equal(def.askDirectorEligible, expected, `${def.key} askDirectorEligible mismatch`)
      }
    }
    // The flag is carried into the planned schema.
    const plan = buildDiscoveryPlan({ goal: 'convert_inquiries', hasWebsite: true, facts: [], locale: 'en' })
    const byKey = Object.fromEntries(plan.map((item) => [item.question_key, item.schema.askDirectorEligible]))
    assert.equal(byKey.ci_where, false)
    assert.equal(byKey.ci_percent, false)
    assert.equal(byKey.ci_followup, false)
    assert.equal(byKey.ci_objection, true)
  })
})

describe('mergePrefillSuggestions', () => {
  it('orders suggestions by source priority brain > previous_roadmap > deliverable', () => {
    const questions = [{ questionKey: 'q1', status: 'unanswered' as const, value: null }]
    const suggestions: PrefillSuggestion[] = [
      { questionKey: 'q1', suggestedAnswer: 'From deliverable', sourceType: 'deliverable', sourceLabel: 'Report: X', isStale: false },
      { questionKey: 'q1', suggestedAnswer: 'From roadmap', sourceType: 'previous_roadmap', sourceLabel: 'Roadmap', isStale: false },
      { questionKey: 'q1', suggestedAnswer: 'From brain', sourceType: 'brain', sourceLabel: 'Brain node', isStale: false },
    ]
    const merged = mergePrefillSuggestions({ questions, suggestions })
    assert.deepEqual(
      merged.q1.suggestions.map((suggestion) => suggestion.sourceType),
      ['brain', 'previous_roadmap', 'deliverable'],
    )
    assert.equal(merged.q1.conflict, true)
  })

  it('never overwrites an owner-confirmed answer', () => {
    const questions = [
      { questionKey: 'q1', status: 'confirmed' as const, value: { choice: 'X' } },
      { questionKey: 'q2', status: 'answered' as const, value: { choice: 'Y' }, provenance: { kind: 'owner' } },
    ]
    const suggestions: PrefillSuggestion[] = [
      { questionKey: 'q1', suggestedAnswer: 'Z', sourceType: 'brain', sourceLabel: 'B', isStale: false },
      { questionKey: 'q2', suggestedAnswer: 'Z', sourceType: 'brain', sourceLabel: 'B', isStale: false },
    ]
    const merged = mergePrefillSuggestions({ questions, suggestions })
    for (const key of ['q1', 'q2']) {
      assert.equal(merged[key].ownerLocked, true, `${key} should be owner locked`)
      assert.deepEqual(merged[key].suggestions, [], `${key} suggestions must be withheld`)
    }
    assert.equal(isOwnerConfirmed(questions[0]), true)
    assert.equal(isOwnerConfirmed(questions[1]), true)
    // A prefilled (brain) answer is not owner-confirmed and may still be refined.
    assert.equal(
      isOwnerConfirmed({ questionKey: 'q3', status: 'answered', value: { choice: 'X' }, provenance: { kind: 'brain' } }),
      false,
    )
  })

  it('surfaces both suggestions and flags conflict when sources disagree', () => {
    const questions = [{ questionKey: 'q1', status: 'unanswered' as const, value: null }]
    const suggestions: PrefillSuggestion[] = [
      { questionKey: 'q1', suggestedAnswer: 'Answer A', sourceType: 'brain', sourceLabel: 'B', isStale: false },
      { questionKey: 'q1', suggestedAnswer: 'Answer B', sourceType: 'deliverable', sourceLabel: 'Report', isStale: false },
    ]
    const merged = mergePrefillSuggestions({ questions, suggestions })
    assert.equal(merged.q1.conflict, true)
    assert.equal(merged.q1.suggestions.length, 2)
    assert.deepEqual(
      merged.q1.suggestions.map((suggestion) => suggestion.suggestedAnswer),
      ['Answer A', 'Answer B'],
    )
  })

  it('does not flag conflict when sources agree and dedupes to one', () => {
    const questions = [{ questionKey: 'q1', status: 'unanswered' as const, value: null }]
    const suggestions: PrefillSuggestion[] = [
      { questionKey: 'q1', suggestedAnswer: 'Same answer', sourceType: 'brain', sourceLabel: 'B', isStale: false },
      { questionKey: 'q1', suggestedAnswer: 'same answer', sourceType: 'deliverable', sourceLabel: 'Report', isStale: false },
    ]
    const merged = mergePrefillSuggestions({ questions, suggestions })
    assert.equal(merged.q1.conflict, false)
    assert.equal(merged.q1.suggestions.length, 1)
    assert.equal(merged.q1.suggestions[0].sourceType, 'brain')
  })

  it('retains isStale on stale deliverable suggestions', () => {
    const questions = [{ questionKey: 'q1', status: 'unanswered' as const, value: null }]
    const suggestions: PrefillSuggestion[] = [
      { questionKey: 'q1', suggestedAnswer: 'Old report answer', sourceType: 'deliverable', sourceLabel: 'Report: Old', isStale: true },
    ]
    const merged = mergePrefillSuggestions({ questions, suggestions })
    assert.equal(merged.q1.suggestions.length, 1)
    assert.equal(merged.q1.suggestions[0].isStale, true)
  })
})

describe('parsePrefillResponse', () => {
  it('parses valid JSON suggestions and defaults isStale to false', () => {
    const json = JSON.stringify({
      suggestions: [{ questionKey: 'q1', suggestedAnswer: 'A', sourceType: 'brain', sourceLabel: 'B' }],
    })
    const out = prefill.parsePrefillResponse(json)
    assert.equal(out.length, 1)
    assert.equal(out[0].questionKey, 'q1')
    assert.equal(out[0].isStale, false)
  })

  it('parses fenced JSON responses', () => {
    const fenced = '```json\n' + JSON.stringify({ suggestions: [] }) + '\n```'
    assert.deepEqual(prefill.parsePrefillResponse(fenced), [])
  })

  it('rejects invalid JSON with a PrefillValidationError', () => {
    assert.throws(() => prefill.parsePrefillResponse('not json at all'), prefill.PrefillValidationError)
  })

  it('rejects schema-invalid responses with a PrefillValidationError', () => {
    const bad = JSON.stringify({
      suggestions: [{ questionKey: 'q1', suggestedAnswer: 'A', sourceType: 'nonsense', sourceLabel: 'B' }],
    })
    assert.throws(() => prefill.parsePrefillResponse(bad), prefill.PrefillValidationError)
  })
})

describe('runPrefill (mocked, zero live calls)', () => {
  const baseInput = {
    goal: 'validate_idea',
    goalLabel: 'Validate My Business Idea',
    questions: [{ key: 'vi_problem', label: 'What problem?', options: ['Saves time/effort', 'Reduces cost'], askDirectorEligible: true }],
    brain: [],
    deliverables: [],
    previousAnswers: [],
  }

  it('returns validated suggestions and records one model trace', async () => {
    const collector = makeCollector()
    const generate = async () => ({
      text: JSON.stringify({
        suggestions: [
          { questionKey: 'vi_problem', suggestedAnswer: 'Saves time/effort', sourceType: 'brain', sourceLabel: 'Node' },
        ],
      }),
      provider: 'dahl',
      model: 'zai-org/GLM-5.3-Flash',
    })
    const result = await prefill.runPrefill(baseInput, { generate: generate as never, collector: collector as never })
    assert.equal(result.suggestions.length, 1)
    assert.equal(result.suggestions[0].suggestedAnswer, 'Saves time/effort')
    assert.equal(result.provider, 'dahl')
    assert.equal(collector.records.length, 1)
    assert.equal(collector.records[0].operation, 'roadmap_prefill')
  })

  it('returns an empty suggestion list on model failure without throwing', async () => {
    const collector = makeCollector()
    const generate = async () => {
      throw new Error('boom')
    }
    const result = await prefill.runPrefill(baseInput, { generate: generate as never, collector: collector as never })
    assert.deepEqual(result.suggestions, [])
    assert.equal(result.provider, null)
    assert.equal(result.model, null)
    assert.equal(collector.records[0].error, 'boom')
  })

  it('isStale deliverable suggestions survive runPrefill parsing', async () => {
    const collector = makeCollector()
    const generate = async () => ({
      text: JSON.stringify({
        suggestions: [
          { questionKey: 'vi_problem', suggestedAnswer: 'Old', sourceType: 'deliverable', sourceLabel: 'Report: Old', isStale: true },
        ],
      }),
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    })
    const result = await prefill.runPrefill(baseInput, { generate: generate as never, collector: collector as never })
    assert.equal(result.suggestions.length, 1)
    assert.equal(result.suggestions[0].isStale, true)
  })
})

describe('AI_MODE=test model allowlist', () => {
  it('only allows the configured test models and rejects others', () => {
    assert.equal(aiModels.AI_MODE, 'test')
    for (const allowed of aiModels.TEST_ALLOWED_MODELS) {
      assert.equal(aiModels.isModelAllowed(allowed.provider, allowed.model), true)
    }
    assert.equal(aiModels.isModelAllowed('groq', 'some-other-model'), false)
    assert.throws(() => aiModels.assertModelAllowed('groq', 'some-other-model'), aiModels.ModelNotAllowedError)
  })

  it('director role chain in test mode only uses allowed models', () => {
    const chain = aiModels.getRoleModelChain('director')
    assert.ok(chain.length > 0)
    for (const target of chain) {
      assert.equal(aiModels.isModelAllowed(target.provider, target.model), true)
    }
  })
})