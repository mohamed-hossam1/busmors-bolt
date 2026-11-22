import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retrieveBrain, type BrainReader, type BrainRow } from '../../src/features/orchestrator/brain-tool'

function reader(rows: BrainRow[], onCall?: (args: { workspaceId: string; limit: number }) => void): BrainReader {
  return {
    async searchApproved({ workspaceId, limit }) {
      onCall?.({ workspaceId, limit })
      return rows
    },
  }
}

const rows: BrainRow[] = [
  { id: 'a', category: 'company_profile', title: 'Our company', summary: 'We are a cup maker in Cairo', verificationState: 'owner_reported' },
  { id: 'b', category: 'offering', title: 'Pricing', summary: 'A cup costs 50 EGP and a mug 80 EGP', verificationState: 'owner_reported' },
  { id: 'c', category: 'audience', title: 'Audience', summary: 'Young professionals who love coffee', verificationState: 'source_supported' },
]

test('brain tool: returns scored facts and is read-only', async () => {
  const result = await retrieveBrain(reader(rows), 'ws-1', 'what are your prices')
  assert.equal(result.ok, true)
  assert.ok(result.retrievedCount >= 1)
  // The pricing row should rank first for a price query.
  assert.equal(result.facts[0].id, 'b')
})

test('brain tool: respects the result limit', async () => {
  const result = await retrieveBrain(reader(rows), 'ws-1', 'company', { limit: 1 })
  assert.equal(result.facts.length, 1)
})

test('brain tool: enforces tenant scoping by passing the workspace to the reader', async () => {
  let seen = ''
  await retrieveBrain(reader(rows, (args) => { seen = args.workspaceId }), 'tenant-A', 'anything')
  assert.equal(seen, 'tenant-A')
})

test('brain tool: a reader that only returns the tenant\'s rows never leaks other tenants', async () => {
  // Simulate two tenants; the reader (as the server implements it) filters by workspace.
  const store: Record<string, BrainRow[]> = {
    'tenant-A': [{ id: 'a1', category: 'offering', title: 'A product', summary: 'A only', verificationState: 'owner_reported' }],
    'tenant-B': [{ id: 'b1', category: 'offering', title: 'B product', summary: 'B only', verificationState: 'owner_reported' }],
  }
  const scoped: BrainReader = {
    async searchApproved({ workspaceId }) { return store[workspaceId] ?? [] },
  }
  const result = await retrieveBrain(scoped, 'tenant-A', 'product')
  assert.equal(result.facts.length, 1)
  assert.equal(result.facts[0].id, 'a1')
  assert.ok(result.facts.every(f => f.id !== 'b1'))
})

test('brain tool: reader failure returns ok:false gracefully', async () => {
  const failing: BrainReader = { async searchApproved() { throw new Error('db down') } }
  const result = await retrieveBrain(failing, 'ws-1', 'anything')
  assert.equal(result.ok, false)
  assert.equal(result.retrievedCount, 0)
  assert.equal(result.facts.length, 0)
  assert.ok(result.reason)
})

test('brain tool: empty query still returns the top approved facts', async () => {
  const result = await retrieveBrain(reader(rows), 'ws-1', '   ')
  assert.equal(result.ok, true)
  assert.ok(result.retrievedCount >= 1)
})

test('brain tool: summaries are truncated to a safe length', async () => {
  const long: BrainRow[] = [{ id: 'x', category: 'company_profile', title: 'Long', summary: 'a'.repeat(5000), verificationState: 'owner_reported' }]
  const result = await retrieveBrain(reader(long), 'ws-1', 'long', { summaryChars: 200 })
  assert.ok(result.facts[0].summary.length <= 200)
})