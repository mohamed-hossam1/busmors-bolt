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
      assert.equal(chain.length, 1)
      assert.equal(chain[0].provider, 'vercel')
      assert.equal(chain[0].model, 'nvidia/nemotron-3.5-lightning-free')
      assert.equal(config.isModelAllowed(chain[0].provider, chain[0].model), true)
    }

    assert.equal(config.AI_MODELS.onboardingCrawl.provider, 'vercel')
    assert.equal(config.AI_MODELS.onboardingCrawl.model, 'nvidia/nemotron-3.5-lightning-free')
    assert.equal(config.isModelAllowed('vercel', 'nvidia/nemotron-3.5-lightning-free'), true)
    assert.throws(
      () => config.assertModelAllowed('sovereigneg', 'gpt-6-luna'),
      config.ModelNotAllowedError,
    )
    assert.throws(
      () => config.assertModelAllowed('groq', 'openai/gpt-oss-120b'),
      config.ModelNotAllowedError,
    )
  })

  it('uses only Vercel AI Gateway models across all production role chains and fallback template', async () => {
    const config = await loadConfig('production')
    const roles = ['orchestrator', 'director', 'research', 'content', 'marketing-analyst'] as const

    for (const role of roles) {
      const chain = config.getRoleModelChain(role) as Array<{ provider: string; model: string }>
      assert.equal(chain.length, 2)
      assert.equal(chain[1].model, 'nvidia/nemotron-3.5-lightning-free')
      for (const target of chain) {
        assert.equal(target.provider, 'vercel')
        assert.equal(config.isModelAllowed(target.provider, target.model), true)
      }
    }

    assert.equal(config.getRoleModelChain('orchestrator')[0].model, 'minimax/minimax-m3.1-flash')
    assert.equal(config.getRoleModelChain('director')[0].model, 'thinkingmachines/inkling-2-small')
    assert.equal(config.getRoleModelChain('research')[0].model, 'paperinstruments/ultramarine-1-flash')
    assert.equal(config.getRoleModelChain('content')[0].model, 'inclusionai/ling-3.1-flash-1019')
    assert.equal(config.getRoleModelChain('marketing-analyst')[0].model, 'paperinstruments/ultramarine-1-flash')
    assert.equal(config.AI_MODELS.onboardingCrawl.provider, 'vercel')
    assert.equal(config.AI_MODELS.onboardingCrawl.model, 'inception/mercury-3')

    for (const fb of config.PROD_AI_FALLBACK_TEMPLATE as Array<{ provider: string; model: string }>) {
      assert.equal(fb.provider, 'vercel')
      assert.equal(fb.model, 'nvidia/nemotron-3.5-lightning-free')
    }

    assert.equal(config.isModelAllowed('groq', 'openai/gpt-oss-120b'), false)
    assert.equal(config.isModelAllowed('sovereigneg', 'gpt-oss-120b'), false)
    assert.throws(
      () => config.assertModelAllowed('dahl', 'zai-org/GLM-5.3-Flash'),
      config.ModelNotAllowedError,
    )
  })
})