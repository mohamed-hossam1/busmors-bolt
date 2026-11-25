import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AGENT_BUDGETS } from '../../src/config/agent-budgets'

describe('shared agent budgets', () => {
  it('matches the simplified guardrails from the specification', () => {
    assert.equal(AGENT_BUDGETS.activeExecutionTimeoutMs, 10 * 60 * 1000)
    assert.equal(AGENT_BUDGETS.maxLlmCallsPerTask, 50)
    assert.equal(AGENT_BUDGETS.maxExternalToolCallsPerTask, 100)
    assert.equal(AGENT_BUDGETS.maxConcurrentSpecialistSubtasks, 3)
    assert.equal(AGENT_BUDGETS.maxRetriesPerFailedOperation, 2)
  })
})