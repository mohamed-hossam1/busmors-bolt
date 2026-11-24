import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlan, normalizePlanStep } from '../../src/features/roadmap/plan-parse.ts'

test('normalizePlanStep requires a usable title and applies defaults', () => {
  assert.equal(normalizePlanStep({ title: '   ' }, 0), null)
  const step = normalizePlanStep({ title: '  Call ten leads  ' }, 2)
  assert.ok(step)
  assert.equal(step.title, 'Call ten leads')
  assert.equal(step.key, 'step_3')
  assert.equal(step.responsibility, 'owner')
  assert.equal(step.executionMode, 'owner')
  assert.equal(step.effort, 'Not estimated')
  assert.equal(step.externalApproval, null)
})

test('normalizePlanStep preserves director execution and stable keys', () => {
  const step = normalizePlanStep({
    key: 'research-pricing',
    title: 'Research competitor pricing',
    responsibility: 'system',
    executionMode: 'director',
    dependencies: ['a', '', 'b', 5],
    checklist: ['one', 'two', '', 'three'],
    externalApproval: '  owner confirms budget  ',
  }, 0)
  assert.ok(step)
  assert.equal(step.key, 'research-pricing')
  assert.equal(step.responsibility, 'system')
  assert.equal(step.executionMode, 'director')
  assert.deepEqual(step.dependencies, ['a', 'b'])
  assert.deepEqual(step.checklist, ['one', 'two', 'three'])
  assert.equal(step.externalApproval, 'owner confirms budget')
})

test('normalizePlan bounds steps to 12 and drops titleless entries', () => {
  const steps = Array.from({ length: 15 }, (_, index) => ({ title: index === 3 ? '' : `Step ${index}` }))
  const plan = normalizePlan({ title: 'My plan', steps }, 'Grow')
  assert.equal(plan.steps.length, 12) // one titleless dropped from 15, then capped at 12
  assert.equal(plan.goalLabel, 'Grow')
  assert.equal(plan.title, 'My plan')
  assert.deepEqual(plan.contextRefs, [])
})

test('normalizePlan falls back to a default title and empty diff', () => {
  const plan = normalizePlan({ steps: [{ title: 'Only step' }] }, 'Launch')
  assert.equal(plan.title, 'Business roadmap')
  assert.deepEqual(plan.diff, {})
  assert.equal(plan.steps.length, 1)
})

test('normalizePlan keeps unknown metric baselines as provided, never fabricates', () => {
  const plan = normalizePlan({
    title: 'Plan',
    metrics: [{ name: 'Leads', baseline: 'unknown', target: '10' }],
    steps: [{ title: 'Do work' }],
  }, 'Win')
  assert.equal((plan.metrics?.[0] as { baseline?: string })?.baseline, 'unknown')
})