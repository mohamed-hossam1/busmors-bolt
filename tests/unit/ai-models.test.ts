import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

const originalAiMode = process.env.AI_MODE

function setAiMode(mode: string | undefined): void {
  if (mode === undefined) {
    delete process.env.AI_MODE
  } else {
    process.env.AI_MODE = mode
  }
}

async function loadConfig(mode: string | undefined) {
  setAiMode(mode)
  const cacheBuster = mode ?? 'missing'
  return import(`../../src/config/ai-models.ts?mode=${encodeURIComponent(cacheBuster)}`)
}

afterEach(() => {
  setAiMode(originalAiMode)
})

describe('AI model configuration', () => {
  it('fails closed when AI_MODE is missing or invalid', async () => {
    await assert.rejects(() => loadConfig(undefined), /AI_MODE must be exactly/)
    await assert.rejects(() => loadConfig('staging'), /AI_MODE must be exactly/)
  })

  it('allows only the approved provider/model pairs in test mode', async () => {
    const config = await loadConfig('test')
    const roles = ['orchestrator', 'director', 'research', 'content', 'marketing-analyst'] as const

    for (const role of roles) {
      const chain = config.getRoleModelChain(role) as Array<{ provider: string; model: string }>
      assert.ok(chain.length > 0)
      for (const target of chain) {
        assert.equal(config.isModelAllowed(target.provider, target.model), true)
        assert.notEqual(target.provider, 'sovereigneg')
      }
    }

    assert.equal(config.getRoleModelChain('research')[0].provider, 'apinex')
    assert.equal(config.getRoleModelChain('research')[0].model, 'free/gpt-6-luna')
    assert.equal(config.getRoleModelChain('content')[0].provider, 'groq')
    assert.equal(config.isModelAllowed('apinex', 'free/gpt-6-luna'), true)
    assert.throws(
      () => config.assertModelAllowed('sovereigneg', 'gpt-6-luna'),
      config.ModelNotAllowedError,
    )
    assert.throws(
      () => config.assertModelAllowed('groq', 'openai/gpt-oss-20b'),
      config.ModelNotAllowedError,
    )
  })

  it('uses the specified production chains and keeps the unverified Director fallback disabled', async () => {
    const config = await loadConfig('production')

    const research = config.getRoleModelChain('research')
    assert.equal(research[0].provider, 'sovereigneg')
    assert.equal(research[0].model, 'SovereignEG/Qwen3.8-27B-FP8')
    assert.equal(research[1].provider, 'dahl')
    assert.equal(research[2].provider, 'groq')

    const content = config.getRoleModelChain('content')
    assert.equal(content[0].provider, 'sovereigneg')
    assert.equal(content[0].model, 'claude-haiku-5.5')

    const analyst = config.getRoleModelChain('marketing-analyst')
    assert.equal(analyst[0].provider, 'sovereigneg')
    assert.equal(analyst[0].model, 'gpt-6-luna')

    const director = config.getRoleModelChain('director')
    assert.equal(director[0].provider, 'dahl')
    assert.equal(director[1].provider, 'groq')
    assert.equal(director.some((target: { model: string }) => target.model === 'gpt-6-luna'), false)
  })
})