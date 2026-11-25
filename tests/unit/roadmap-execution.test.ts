import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  completionRequiresOwnerAction,
  computeProgress,
  isReviewDue,
  resolveExecutionState,
  selectNextBestAction,
  type ProgressStep,
} from '../../src/features/roadmap/progress'
import {
  buildDirectorPrompt,
  buildRoadmapStepOrigin,
} from '../../src/server/roadmap/execution'

function makeStep(overrides: Partial<ProgressStep> & Pick<ProgressStep, 'id' | 'step_key' | 'position'>): ProgressStep {
  return {
    milestone_key: null,
    milestone_position: 0,
    priority: 'medium',
    owner_role: 'owner',
    action_kind: 'owner_execution',
    status: 'ready',
    execution_state: 'not_started',
    dependencies: [],
    ...overrides,
  }
}

describe('computeProgress (deterministic, from persisted rows only)', () => {
  it('is 0% when nothing is started', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'a', position: 0 }),
      makeStep({ id: '2', step_key: 'b', position: 1 }),
      makeStep({ id: '3', step_key: 'c', position: 2 }),
    ]
    assert.deepEqual(computeProgress(steps), { completedCount: 0, activeTotal: 3, percent: 0 })
  })

  it('computes a partial percentage', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'a', position: 0, status: 'completed', execution_state: 'completed' }),
      makeStep({ id: '2', step_key: 'b', position: 1, status: 'running', execution_state: 'in_progress' }),
      makeStep({ id: '3', step_key: 'c', position: 2, status: 'running', execution_state: 'in_progress' }),
      makeStep({ id: '4', step_key: 'd', position: 3, status: 'skipped', execution_state: 'skipped' }),
    ]
    // activeTotal excludes the skipped step -> 3; completed 1 -> 33%.
    assert.deepEqual(computeProgress(steps), { completedCount: 1, activeTotal: 3, percent: 33 })
  })

  it('ignores skipped/inapplicable steps entirely', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'a', position: 0, status: 'completed', execution_state: 'completed' }),
      makeStep({ id: '2', step_key: 'b', position: 1, status: 'completed', execution_state: 'completed' }),
      makeStep({ id: '3', step_key: 'c', position: 2, status: 'skipped', execution_state: 'skipped' }),
      makeStep({ id: '4', step_key: 'd', position: 3, status: 'inapplicable', execution_state: 'skipped' }),
    ]
    assert.deepEqual(computeProgress(steps), { completedCount: 2, activeTotal: 2, percent: 100 })
  })

  it('is 100% when every active step is completed', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'a', position: 0, status: 'completed', execution_state: 'completed' }),
      makeStep({ id: '2', step_key: 'b', position: 1, status: 'completed', execution_state: 'completed' }),
    ]
    assert.deepEqual(computeProgress(steps), { completedCount: 2, activeTotal: 2, percent: 100 })
  })
})

describe('selectNextBestAction (dependencies + priority)', () => {
  it('prefers a high-priority step with satisfied dependencies', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'a', position: 0, priority: 'low' }),
      makeStep({ id: '2', step_key: 'b', position: 1, priority: 'high' }),
    ]
    const next = selectNextBestAction(steps)
    assert.ok(next)
    assert.equal(next?.step.step_key, 'b')
    assert.ok(next?.reason.length)
  })

  it('skips a high-priority step whose dependency is not satisfied', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'x', position: 0, priority: 'high', dependencies: ['y'] }),
      makeStep({ id: '2', step_key: 'y', position: 1, priority: 'medium' }),
    ]
    const next = selectNextBestAction(steps)
    assert.equal(next?.step.step_key, 'y')
  })

  it('advances to a dependent step once its dependency is completed', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'a', position: 0, priority: 'high', status: 'completed', execution_state: 'completed' }),
      makeStep({ id: '2', step_key: 'b', position: 1, priority: 'high', dependencies: ['a'] }),
    ]
    const next = selectNextBestAction(steps)
    assert.equal(next?.step.step_key, 'b')
  })

  it('returns null when nothing is actionable', () => {
    const steps = [
      makeStep({ id: '1', step_key: 'a', position: 0, status: 'completed', execution_state: 'completed' }),
      makeStep({ id: '2', step_key: 'b', position: 1, status: 'skipped', execution_state: 'skipped' }),
      makeStep({ id: '3', step_key: 'c', position: 2, status: 'blocked', execution_state: 'blocked' }),
    ]
    assert.equal(selectNextBestAction(steps), null)
  })
})

describe('isReviewDue (pure, no timers)', () => {
  const now = new Date('2026-11-25T12:00:00Z').getTime()

  it('reports overdue days for a past review', () => {
    const past = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
    assert.deepEqual(isReviewDue(past, now), { due: true, daysOverdue: 3, daysRemaining: 0 })
  })

  it('reports remaining days for a future review', () => {
    const future = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString()
    assert.deepEqual(isReviewDue(future, now), { due: false, daysOverdue: 0, daysRemaining: 2 })
  })

  it('is not due when there is no next review date', () => {
    assert.deepEqual(isReviewDue(null, now), { due: false, daysOverdue: 0, daysRemaining: 0 })
  })
})

describe('resolveExecutionState + completion rule', () => {
  it('maps owner_reported Director output to waiting_for_owner, never completed', () => {
    const state = resolveExecutionState(
      makeStep({ id: '1', step_key: 'a', position: 0, owner_role: 'director', status: 'owner_reported', execution_state: null }),
    )
    assert.equal(state, 'waiting_for_owner')
    assert.notEqual(state, 'completed')
    assert.equal(completionRequiresOwnerAction(), true)
  })

  it('maps a running Director step to waiting_for_director', () => {
    const state = resolveExecutionState(
      makeStep({ id: '1', step_key: 'a', position: 0, owner_role: 'director', status: 'running', execution_state: null }),
    )
    assert.equal(state, 'waiting_for_director')
  })

  it('maps a running owner step to in_progress', () => {
    const state = resolveExecutionState(
      makeStep({ id: '1', step_key: 'a', position: 0, owner_role: 'owner', status: 'running', execution_state: null }),
    )
    assert.equal(state, 'in_progress')
  })

  it('prefers an explicit execution_state column', () => {
    const state = resolveExecutionState(
      makeStep({ id: '1', step_key: 'a', position: 0, status: 'ready', execution_state: 'waiting_for_owner' }),
    )
    assert.equal(state, 'waiting_for_owner')
  })

  it('maps legacy skipped/inapplicable/blocked/completed statuses', () => {
    assert.equal(resolveExecutionState(makeStep({ id: '1', step_key: 'a', position: 0, status: 'inapplicable', execution_state: null })), 'skipped')
    assert.equal(resolveExecutionState(makeStep({ id: '2', step_key: 'b', position: 1, status: 'blocked', execution_state: null })), 'blocked')
    assert.equal(resolveExecutionState(makeStep({ id: '3', step_key: 'c', position: 2, status: 'completed', execution_state: null })), 'completed')
    assert.equal(resolveExecutionState(makeStep({ id: '4', step_key: 'd', position: 3, status: 'ready', execution_state: null })), 'not_started')
  })
})

describe('buildDirectorPrompt + buildRoadmapStepOrigin', () => {
  it('builds a research/analysis handoff that saves to Deliverables', () => {
    const research = buildDirectorPrompt({ actionKind: 'research', stepTitle: 'Competitor scan', locale: 'en' })
    assert.match(research, /Deliverables/)
    assert.match(research, /research/i)
    const analysis = buildDirectorPrompt({ actionKind: 'analysis', stepTitle: 'Funnel analysis', locale: 'en' })
    assert.match(analysis, /analysis/i)
    assert.match(analysis, /Deliverables/)
  })

  it('builds a content handoff that lands as Calendar drafts and never auto-publishes', () => {
    const content = buildDirectorPrompt({ actionKind: 'content', stepTitle: 'Launch posts', locale: 'en' })
    assert.match(content, /Calendar draft/i)
    assert.match(content, /two-step/i)
    assert.match(content, /NOT publish|Do NOT publish/i)
  })

  it('records a roadmap_step origin preserving the action kind', () => {
    const origin = buildRoadmapStepOrigin({
      roadmapId: 'r1',
      planVersionId: 'v1',
      stepId: 's1',
      actionKind: 'content',
    })
    assert.equal(origin.kind, 'roadmap_step')
    assert.equal(origin.actionKind, 'content')
    assert.equal(origin.stepId, 's1')
    assert.equal(origin.roadmapId, 'r1')
    assert.equal(origin.planVersionId, 'v1')
  })
})