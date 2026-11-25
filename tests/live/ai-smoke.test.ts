import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AI_MODE, getRoleModelChain } from '../../src/config/ai-models'
import { generateWithRole } from '../../src/server/ai-gateway'

describe(`live AI_MODE=${AI_MODE} smoke tests`, () => {
  it('pings the configured orchestrator primary model', { timeout: 180_000 }, async () => {
    const expected = getRoleModelChain('orchestrator')[0]
    const result = await generateWithRole({
      role: 'orchestrator',
      system: 'You are a connectivity smoke test. Reply with exactly OK.',
      prompt: 'OK',
      timeoutMs: 120_000,
    })

    assert.equal(result.provider, expected.provider)
    assert.equal(result.model, expected.model)
    assert.ok(result.text.trim().length > 0)
    console.log(
      JSON.stringify({
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        usage: result.usage,
      }),
    )
  })

  it('pings the configured specialist primary model', { timeout: 180_000 }, async () => {
    const expected = getRoleModelChain('research')[0]
    const result = await generateWithRole({
      role: 'research',
      system: 'You are a connectivity smoke test. Reply with exactly OK.',
      prompt: 'OK',
      timeoutMs: 120_000,
    })

    assert.equal(result.provider, expected.provider)
    assert.equal(result.model, expected.model)
    assert.ok(result.text.trim().length > 0)
    console.log(
      JSON.stringify({
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        usage: result.usage,
      }),
    )
  })
})