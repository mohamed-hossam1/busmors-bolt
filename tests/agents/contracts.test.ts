import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROLE_TEMPERATURE,
  TERMINAL_STATUSES,
  isTerminal,
  isSpecialist,
  canDelegate,
  ownsDelivery,
  SPECIALIST_ROLES,
  type AgentRole,
  type TaskStatus,
} from '../../src/features/agents/contracts.ts'

test('exactly five approved roles with approved temperatures', () => {
  const roles: AgentRole[] = ['orchestrator', 'director', 'research', 'content', 'marketing_analyst']
  for (const r of roles) {
    assert.equal(typeof ROLE_TEMPERATURE[r], 'number')
  }
  assert.equal(ROLE_TEMPERATURE.orchestrator, 0.2)
  assert.equal(ROLE_TEMPERATURE.director, 0.3)
  assert.equal(ROLE_TEMPERATURE.content, 0.7)
})

test('only the Director may delegate and owns delivery', () => {
  assert.equal(canDelegate('director'), true)
  assert.equal(canDelegate('orchestrator'), false)
  assert.equal(canDelegate('research'), false)
  assert.equal(ownsDelivery('director'), true)
  assert.equal(ownsDelivery('research'), false)
})

test('three specialists, no specialist-to-specialist delegation', () => {
  assert.deepEqual([...SPECIALIST_ROLES], ['research', 'content', 'marketing_analyst'])
  assert.equal(isSpecialist('research'), true)
  assert.equal(isSpecialist('content'), true)
  assert.equal(isSpecialist('marketing_analyst'), true)
  assert.equal(isSpecialist('orchestrator'), false)
  assert.equal(isSpecialist('director'), false)
})

test('terminal statuses are completed, partial, failed, cancelled', () => {
  const terminals: TaskStatus[] = ['completed', 'partial', 'failed', 'cancelled']
  for (const s of terminals) assert.equal(isTerminal(s), true)
  for (const s of ['queued', 'running', 'awaiting_input', 'interrupted'] as TaskStatus[]) {
    assert.equal(isTerminal(s), false)
  }
  assert.ok(TERMINAL_STATUSES.includes('partial'))
})