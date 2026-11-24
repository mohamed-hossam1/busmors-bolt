import test from 'node:test'
import assert from 'node:assert/strict'
import { EvidenceLedger, extractHttpUrls } from '../../src/features/agents/evidence.ts'
import { runSpecialist } from '../../src/features/agents/specialist.ts'

test('evidence ledger: ignores failed and empty tool outcomes', () => {
  const ledger = new EvidenceLedger()
  ledger.recordToolOutcome('tavily_search', { query: 'coffee' }, false, { hits: [{ url: 'https://example.com', title: 'X', snippet: 'Y' }] })
  assert.equal(ledger.hasExternalEvidence(), false)

  ledger.recordToolOutcome('tavily_search', { query: 'coffee' }, true, { hits: [] })
  assert.equal(ledger.hasExternalEvidence(), false)

  ledger.recordToolOutcome('firecrawl_scrape', { url: 'https://example.com' }, true, { url: 'https://example.com', markdown: 'short' })
  assert.equal(ledger.hasExternalEvidence(), false)

  ledger.recordToolOutcome('tavily_search', { query: 'cairo coffee' }, true, {
    hits: [{ url: 'https://real-roaster.eg/shop', title: 'Real Roaster', snippet: '250g bag EGP 240' }],
  })
  assert.equal(ledger.hasExternalEvidence(), true)
  assert.deepEqual(ledger.findUngroundedUrls('Check https://real-roaster.eg/shop vs https://invented.com/fake'), ['https://invented.com/fake'])
})

test('research specialist: blocks ungrounded URLs and empty-tool completion, allows honest partial', async () => {
  let turn = 0
  const result = await runSpecialist(
    'research',
    { goal: 'Find 2 Greater Cairo coffee shops', scope: 'Cairo', contextBlock: '' },
    {
      model: async (messages) => {
        turn += 1
        if (turn === 1) {
          return { text: 'Try https://fabricated-coffee.com', toolCalls: [] }
        }
        // Check that gate feedback reached the model
        assert.ok(messages.some((m) => m.content.includes('fabricated-coffee.com')))
        if (turn === 2) {
          return {
            text: '',
            toolCalls: [{ id: 'tc1', name: 'tavily_search', args: { query: 'specialty coffee Cairo 250g' } }],
          }
        }
        if (turn === 3) {
          // Still cites an ungrounded URL alongside a real one
          return { text: 'Found https://real-coffee.eg/beans and https://hallucinated.eg/price', toolCalls: [] }
        }
        return { text: 'Verified real shop: https://real-coffee.eg/beans (EGP 250 for 250g).', toolCalls: [] }
      },
      now: Date.now,
      readSkill: async () => null,
      executeTool: async (name) => {
        if (name === 'tavily_search') {
          return { ok: true, output: { provider: 'tavily', hits: [{ url: 'https://real-coffee.eg/beans', title: 'Real Coffee', snippet: '250g EGP 250' }] } }
        }
        return { ok: false, error: 'unexpected tool' }
      },
    },
  )

  assert.equal(result.status, 'completed')
  assert.deepEqual(result.invokedTools, ['tavily_search'])
  assert.ok(result.evidenceRefs.includes('https://real-coffee.eg/beans'))
  assert.equal(extractHttpUrls(result.summary).length, 1)
})

test('research specialist: honest partial when search fails and no evidence retrieved', async () => {
  const result = await runSpecialist(
    'research',
    { goal: 'Find coffee shops', scope: 'Cairo', contextBlock: '' },
    {
      model: async () => ({
        text: '',
        toolCalls: [
          {
            id: 'f1',
            name: 'finish',
            args: { status: 'partial', summary: 'Web search returned no usable sources; unable to verify prices.' },
          },
        ],
      }),
      now: Date.now,
      readSkill: async () => null,
      executeTool: async () => ({ ok: false, error: 'rate_limited' }),
    },
  )
  assert.equal(result.status, 'partial')
  assert.ok(result.limitations.length > 0)
})

test('analyst specialist: blocks answer without calculate tool, passes once tool provenance exists', async () => {
  let turn = 0
  const result = await runSpecialist(
    'marketing_analyst',
    { goal: 'Compute ROAS for spend 1600 and value 8000', scope: 'Week A', contextBlock: '' },
    {
      model: async () => {
        turn += 1
        if (turn === 1) return { text: 'ROAS is 5.0x', toolCalls: [] }
        if (turn === 2) {
          return {
            text: '',
            toolCalls: [{ id: 'c1', name: 'calculate', args: { formula: 'roas', values: { attributedValue: 8000, spend: 1600 } } }],
          }
        }
        return { text: 'Computed ROAS via calculate: 5.0x.', toolCalls: [] }
      },
      now: Date.now,
      readSkill: async () => null,
      executeTool: async () => ({ ok: true, output: { value: 5, unit: 'x', formula: 'roas', inputs: { attributedValue: 8000, spend: 1600 } } }),
    },
  )
  assert.equal(result.status, 'completed')
  assert.deepEqual(result.invokedTools, ['calculate'])
  assert.ok(result.evidenceRefs.some((r) => r.includes('calculate:roas=5x')))
})
