import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENT_BUDGETS,
  emptyUsage,
  evaluateBudget,
  withFinalizationReserve,
  type BudgetUsage,
} from '../../src/config/agent-budgets.ts'

function usage(overrides: Partial<Omit<BudgetUsage, 'externalTool'>> & { externalTool?: Partial<BudgetUsage['externalTool']> } = {}): BudgetUsage {
  return { ...emptyUsage(), ...overrides, externalTool: { ...emptyUsage().externalTool, ...(overrides.externalTool ?? {}) } }
}

test('shared ceilings match the approved spec values', () => {
  assert.equal(AGENT_BUDGETS.activeTimeMs.soft, 5 * 60 * 1000)
  assert.equal(AGENT_BUDGETS.activeTimeMs.hard, 10 * 60 * 1000)
  assert.equal(AGENT_BUDGETS.llmAttempts.soft, 25)
  assert.equal(AGENT_BUDGETS.llmAttempts.hard, 50)
  assert.equal(AGENT_BUDGETS.inputTokens.hard, 300_000)
  assert.equal(AGENT_BUDGETS.outputTokens.hard, 50_000)
  assert.equal(AGENT_BUDGETS.externalToolAttempts.hard, 100)
  assert.equal(AGENT_BUDGETS.concurrentSubtasks.hard, 3)
  assert.equal(AGENT_BUDGETS.retriesPerOperation.hard, 2)
  assert.equal(AGENT_BUDGETS.externalToolCeilings.tavily, 25)
  assert.equal(AGENT_BUDGETS.externalToolCeilings.firecrawl, 40)
})

test('a fresh budget is ok', () => {
  const d = evaluateBudget(emptyUsage(), {})
  assert.equal(d.allowed, true)
  assert.equal(d.level, 'ok')
})

test('crossing a soft ceiling is allowed but flagged soft', () => {
  const d = evaluateBudget(emptyUsage(), { llmAttempts: 26 })
  assert.equal(d.allowed, true)
  assert.equal(d.level, 'soft')
  assert.equal(d.resource, 'llmAttempts')
})

test('exceeding a hard ceiling is denied', () => {
  const d = evaluateBudget(emptyUsage(), { llmAttempts: 51 })
  assert.equal(d.allowed, false)
  assert.equal(d.level, 'hard')
})

test('input token hard ceiling denies an over-limit request', () => {
  const d = evaluateBudget(usage({ inputTokens: 299_900 }), { inputTokens: 300_100 })
  assert.equal(d.allowed, false)
  assert.equal(d.resource, 'inputTokens')
})

test('per-tool external ceiling is enforced within the aggregate', () => {
  const d = evaluateBudget(emptyUsage(), { externalTool: { tavily: 26 } })
  assert.equal(d.allowed, false)
  assert.equal(d.resource, 'tavily')
})

test('aggregate external ceiling and per-tool ceiling are distinct', () => {
  // 24+24 tavily/exa stays under each 25 ceiling and under the 50 soft aggregate.
  const u = usage({ externalTool: { tavily: 24, exa: 24 } })
  const d = evaluateBudget(u, { externalToolAttempts: 49 })
  assert.equal(d.allowed, true)
})

test('finalization reserve consumes capacity so later work cannot use it', () => {
  const reserved = withFinalizationReserve(emptyUsage(), { llmAttempts: 10, inputTokens: 20_000 })
  assert.equal(reserved.llmAttempts, 10)
  assert.equal(reserved.inputTokens, 20_000)
  // With 40 attempts left, only 40 - 10 reserved = 30 usable before hard 50.
  const d = evaluateBudget(reserved, { llmAttempts: 45 })
  assert.equal(d.allowed, true) // 45 <= 50 hard, but 45 > 25 soft
  assert.equal(d.level, 'soft')
})

test('reserve cannot silently exceed a hard limit', () => {
  const d = evaluateBudget(usage({ llmAttempts: 48 }), { llmAttempts: 52 })
  assert.equal(d.allowed, false)
})