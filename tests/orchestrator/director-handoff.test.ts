import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDirectorHandoff, handoffCheckpoint, taskTypeForIntent } from '../../src/features/orchestrator/director-handoff'
import type { OrchestratorDecision } from '../../src/features/orchestrator/contracts'

function decision(over: Partial<OrchestratorDecision>): OrchestratorDecision {
  return { path: 'task', reply: '', brainQuery: '', intent: 'simple_answer', quantity: 1, researchMode: 'standard', ...over }
}

test('handoff: content_creation maps to a content task with the requested quantity', () => {
  const h = planDirectorHandoff(decision({ intent: 'content_creation', quantity: 5 }))
  assert.ok(h)
  assert.equal(h!.intent, 'content_creation')
  assert.equal(h!.type, 'content_creation')
  assert.equal(h!.quantity, 5)
  assert.equal(h!.research, false)
  assert.equal(h!.route.mode, 'task')
})

test('handoff: campaign_planning maps to a campaign task', () => {
  const h = planDirectorHandoff(decision({ intent: 'campaign_planning', quantity: 3 }))
  assert.equal(h!.type, 'campaign_planning')
  assert.equal(h!.quantity, 3)
})

test('handoff: marketing_research is marked as research', () => {
  const h = planDirectorHandoff(decision({ intent: 'marketing_research', quantity: 1, researchMode: 'deep' }))
  assert.equal(h!.research, true)
  assert.equal(h!.route.researchMode, 'deep')
})

test('handoff: performance_diagnosis maps to a diagnosis task', () => {
  const h = planDirectorHandoff(decision({ intent: 'performance_diagnosis', quantity: 1 }))
  assert.equal(h!.type, 'performance_diagnosis')
})

test('handoff: simple_answer is not an execution task', () => {
  const h = planDirectorHandoff(decision({ intent: 'simple_answer', quantity: 1 }))
  assert.equal(h, null)
})

test('handoff: quantity is clamped to the allowed 1..12 range', () => {
  assert.equal(planDirectorHandoff(decision({ intent: 'content_creation', quantity: 99 }))!.quantity, 12)
  assert.equal(planDirectorHandoff(decision({ intent: 'content_creation', quantity: 0 }))!.quantity, 1)
})

test('handoff: checkpoint is pre-seeded to the generate phase with the route', () => {
  const h = planDirectorHandoff(decision({ intent: 'content_creation', quantity: 4 }))!
  const cp = handoffCheckpoint(h)
  assert.equal(cp.phase, 'generate')
  assert.equal(cp.route?.mode, 'task')
  assert.equal(cp.route?.intent, 'content_creation')
  assert.equal(cp.route?.quantity, 4)
})

test('handoff: task type helper is consistent', () => {
  assert.equal(taskTypeForIntent('marketing_research'), 'marketing_research')
  assert.equal(taskTypeForIntent('content_creation'), 'content_creation')
})