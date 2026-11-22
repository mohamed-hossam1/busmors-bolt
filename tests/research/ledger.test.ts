import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FreeTierLedger, InsufficientAllowanceError, memoryLedgerBackend } from '../../src/features/research/ledger/ledger'
import type { ResearchBudget } from '../../src/features/research/contracts'
import { addUsage, emptyUsage } from '../../src/features/research/contracts'

const budget: ResearchBudget = { calls: 3, pages: 4, tokens: 1000, seconds: 30, credits: 3 }

function ledgerWith(initial: ResearchBudget = budget) {
  const memory = memoryLedgerBackend(initial)
  return { ledger: new FreeTierLedger(memory.backend, initial, 'task-1'), memory }
}

test('ledger: reserve → settle deducts the real usage', async () => {
  const { ledger, memory } = ledgerWith()
  const reservation = await ledger.reserve('firecrawl', 'extract', { calls: 1, pages: 1, tokens: 0, credits: 1 })
  assert.equal(reservation.callId.length > 0, true)
  assert.equal(ledger.snapshot.allowance.calls, 2)
  const settled = await ledger.settle(reservation.callId, { calls: 1, pages: 1, tokens: 120, credits: 1 })
  assert.equal(settled.settled, true)
  assert.equal(ledger.snapshot.allowance.tokens, 880)
  assert.equal(memory.allowance.tokens, 880)
  assert.equal(ledger.snapshot.settledCalls, 1)
})

test('ledger: an exhausted allowance throws a typed non-retryable error', async () => {
  const { ledger } = ledgerWith({ calls: 1, pages: 0, tokens: 0, seconds: 10, credits: 0 })
  await assert.rejects(
    () => ledger.reserve('tavily', 'search', { calls: 1, pages: 0, tokens: 100, credits: 1 }),
    (error: unknown) => {
      assert.ok(error instanceof InsufficientAllowanceError)
      assert.equal(error.code, 'insufficient_allowance')
      assert.equal(error.retryable, false)
      return true
    },
  )
})

test('ledger: a failed call releases its reservation', async () => {
  const { ledger, memory } = ledgerWith()
  const reservation = await ledger.reserve('tavily', 'search', { calls: 1, pages: 0, tokens: 100, credits: 1 })
  await ledger.release(reservation.callId)
  assert.equal(memory.allowance.calls, budget.calls)
  assert.equal(memory.allowance.credits, budget.credits)
})

test('ledger: a low allowance reduces scope instead of buying credits', async () => {
  const { ledger } = ledgerWith({ calls: 4, pages: 4, tokens: 1000, seconds: 30, credits: 4 })
  const reduced = ledger.reducedBudget(0.5)
  assert.equal(reduced.calls, 2)
  assert.equal(reduced.credits, 2)
  assert.ok(reduced.tokens >= 500)
})

test('ledger: usage is additive across providers', () => {
  let usage = emptyUsage()
  usage = addUsage(usage, { calls: 1, pages: 1, credits: 1 })
  usage = addUsage(usage, { calls: 2, pages: 0, credits: 0 })
  assert.deepEqual(usage, { calls: 3, pages: 1, tokens: 0, credits: 1 })
})