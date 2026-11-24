import test from 'node:test'
import assert from 'node:assert/strict'
import { scrub, projectValue } from '../../src/server/observability/sanitize.ts'
import { TraceCollector } from '../../src/server/observability/collector.ts'
import { captureDetailEnabled } from '../../src/server/observability/config.ts'

test('scrub redacts secrets and PII', () => {
  const input = 'Contact me at jane.doe@example.com or 01012345678, key sk-abcdefgh12345678'
  const out = scrub(input)
  assert.equal(out.includes('jane.doe@example.com'), false)
  assert.equal(out.includes('01012345678'), false)
  assert.equal(out.includes('sk-abcdefgh12345678'), false)
  assert.ok(out.includes('[REDACTED'))
})

test('projectValue bounds nested structures', () => {
  const deep = { a: { b: { c: { d: 'secret sk-abcdefgh12345678' } } }, list: Array.from({ length: 100 }, (_, i) => i) }
  const projected = projectValue(deep) as Record<string, unknown>
  assert.ok(projected.a)
  const list = projected.list as unknown[]
  assert.ok(list.length <= 50)
})

function makeCollector() {
  const events: unknown[] = []
  const traceRows: unknown[] = []
  const collector = new TraceCollector(
    { traceId: '11111111-1111-1111-1111-111111111111', workspaceId: 'w1', request: 'hello' },
    { sink: async (trace, evts) => { traceRows.push(trace); events.push(...evts) }, enabled: true },
  )
  return { collector, events, traceRows }
}

test('recordSkill emits a skill event with version metadata', async () => {
  const { collector, events, traceRows } = makeCollector()
  collector.recordSkill({ skillId: 'kpi-evaluation', role: 'marketing_analyst', version: '1.0.0', contentHash: 'abc', status: 'completed' })
  await collector.flush()
  const skill = events.find((e) => (e as { event_type?: string }).event_type === 'skill') as Record<string, unknown>
  assert.ok(skill)
  assert.equal(skill.agent_id, 'kpi-evaluation')
  assert.equal((skill.metadata as Record<string, unknown>).version, '1.0.0')
  assert.equal(traceRows.length, 1)
})

test('recordModel nests under a parent agent event id', async () => {
  const { collector, events } = makeCollector()
  const parent = '22222222-2222-2222-2222-222222222222'
  collector.recordModel({ provider: 'groq', model: 'openai/gpt-oss-120b', operation: 'orchestrate', instanceId: parent, parentEventId: parent, usage: { inputTokens: 10, outputTokens: 5 }, cost: { amount: 0, currency: 'USD', basis: 'free_tier' } })
  await collector.flush()
  const model = events.find((e) => (e as { event_type?: string }).event_type === 'model') as Record<string, unknown>
  assert.equal(model.parent_event_id, parent)
  assert.equal(model.llm_input_tokens, 10)
  assert.equal(model.llm_output_tokens, 5)
})

test('capture mode is metadata in production, full in test', () => {
  const prevMode = process.env.AI_MODE
  const prevCapture = process.env.OBSERVABILITY_CAPTURE
  delete process.env.OBSERVABILITY_CAPTURE
  process.env.AI_MODE = 'test'
  assert.equal(captureDetailEnabled(), true)
  process.env.AI_MODE = 'production'
  assert.equal(captureDetailEnabled(), false)
  process.env.OBSERVABILITY_CAPTURE = 'full'
  assert.equal(captureDetailEnabled(), true)
  process.env.OBSERVABILITY_CAPTURE = 'metadata'
  assert.equal(captureDetailEnabled(), false)
  process.env.AI_MODE = prevMode
  if (prevCapture === undefined) delete process.env.OBSERVABILITY_CAPTURE
  else process.env.OBSERVABILITY_CAPTURE = prevCapture
})

test('recordAgent stores input/output only when capture detail is enabled', async () => {
  const prevCapture = process.env.OBSERVABILITY_CAPTURE
  process.env.OBSERVABILITY_CAPTURE = 'metadata'
  const { collector, events } = makeCollector()
  collector.recordAgent({ agentId: 'director', agentRole: 'director', instanceId: '33333333-3333-3333-3333-333333333333', input: { goal: 'x' }, output: { summary: 'y' } })
  await collector.flush()
  const agent = events.find((e) => (e as { event_type?: string }).event_type === 'agent') as Record<string, unknown>
  assert.deepEqual(agent.input_payload, { captured: false })
  assert.deepEqual(agent.output_preview, { captured: false })
  if (prevCapture === undefined) delete process.env.OBSERVABILITY_CAPTURE
  else process.env.OBSERVABILITY_CAPTURE = prevCapture
})