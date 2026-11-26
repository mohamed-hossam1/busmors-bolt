import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { APICallError } from 'ai'

type MockOptions = {
  model: unknown
  system?: string
  prompt: string
  temperature?: number
  maxRetries: number
  abortSignal?: AbortSignal
  timeout?: number | { totalMs?: number; stepMs?: number; chunkMs?: number }
}

type MockResult = {
  text: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    raw?: unknown
  }
  finishReason?: string
  warnings?: unknown[]
}

const originalEnv = {
  AI_MODE: process.env.AI_MODE,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DAHL_API_KEY: process.env.DAHL_API_KEY,
  APINEX_API_KEY: process.env.APINEX_API_KEY,
  AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
  SOVEREIGNEG_API_KEY: process.env.SOVEREIGNEG_API_KEY,
}

let gatewayModule: typeof import('../../src/server/ai-gateway')

function mockSequence(responses: Array<MockResult | Error>) {
  const calls: MockOptions[] = []
  let index = 0
  const generate = async (options: MockOptions): Promise<MockResult> => {
    calls.push(options)
    const next = responses[index++]
    if (!next) throw new Error('Unexpected extra model call')
    if (next instanceof Error) throw next
    return next
  }
  return { calls, generate }
}

before(async () => {
  process.env.AI_MODE = 'test'
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  process.env.APINEX_API_KEY = 'test-apinex-key'
  process.env.AI_GATEWAY_API_KEY = 'test-vercel-gateway-key'
  process.env.SOVEREIGNEG_API_KEY = 'test-sovereigneg-key'
  const gatewayModulePath = '../../src/server/ai-gateway.ts?gateway-test=1'
  gatewayModule = await import(gatewayModulePath)
})

after(() => {
  if (originalEnv.AI_MODE === undefined) delete process.env.AI_MODE
  else process.env.AI_MODE = originalEnv.AI_MODE
  if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY
  else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY
  if (originalEnv.DAHL_API_KEY === undefined) delete process.env.DAHL_API_KEY
  else process.env.DAHL_API_KEY = originalEnv.DAHL_API_KEY
  if (originalEnv.APINEX_API_KEY === undefined) delete process.env.APINEX_API_KEY
  else process.env.APINEX_API_KEY = originalEnv.APINEX_API_KEY
  if (originalEnv.AI_GATEWAY_API_KEY === undefined) delete process.env.AI_GATEWAY_API_KEY
  else process.env.AI_GATEWAY_API_KEY = originalEnv.AI_GATEWAY_API_KEY
  if (originalEnv.SOVEREIGNEG_API_KEY === undefined) delete process.env.SOVEREIGNEG_API_KEY
  else process.env.SOVEREIGNEG_API_KEY = originalEnv.SOVEREIGNEG_API_KEY
})

describe('central model gateway', () => {
  it('falls back on a simulated provider 429 and reports usage and fallback metadata', async () => {
    const rateLimit = new APICallError({
      message: 'rate limited',
      url: 'https://example.test/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 429,
      isRetryable: true,
    })
    const { calls, generate } = mockSequence([
      rateLimit,
      {
        text: 'fallback response',
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
        finishReason: 'stop',
      },
    ])
    const generateWithRole = gatewayModule.createModelGateway({ generateText: generate as never, mode: 'production' })

    const result = await generateWithRole({
      role: 'content',
      system: 'system',
      prompt: 'prompt',
    })

    assert.equal(calls.length, 2)
    assert.equal(result.provider, 'sovereigneg')
    assert.equal(result.model, 'gpt-6-luna')
    assert.equal(result.fallback.used, true)
    assert.equal(result.fallback.reason, 'rate_limit')
    assert.equal(result.usage.inputTokens, 11)
    assert.equal(result.usage.outputTokens, 7)
    assert.equal(result.fallback.attempts[0].ok, false)
    assert.equal(result.fallback.attempts[1].ok, true)
  })

  it('falls back on a simulated timeout', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError')
    const { calls, generate } = mockSequence([
      timeout,
      {
        text: 'fallback after timeout',
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
        finishReason: 'stop',
      },
    ])
    const generateWithRole = gatewayModule.createModelGateway({ generateText: generate as never, mode: 'production' })

    const result = await generateWithRole({
      role: 'research',
      system: 'system',
      prompt: 'prompt',
    })

    assert.equal(calls.length, 2)
    assert.equal(result.provider, 'sovereigneg')
    assert.equal(result.model, 'glm-5.3-flash')
    assert.equal(result.fallback.reason, 'timeout')
  })

  it('does not fall back on a security error', async () => {
    const unauthorized = new APICallError({
      message: 'invalid key',
      url: 'https://example.test/v1/chat/completions',
      requestBodyValues: {},
      statusCode: 401,
      isRetryable: false,
    })
    const { calls, generate } = mockSequence([unauthorized])
    const generateWithRole = gatewayModule.createModelGateway({ generateText: generate as never })

    await assert.rejects(
      () => generateWithRole({ role: 'content', system: 'system', prompt: 'prompt' }),
      (error: unknown) => error === unauthorized,
    )
    assert.equal(calls.length, 1)
    assert.equal(gatewayModule.isEligibleTechnicalFailure(unauthorized), false)
  })

  it('does not fall back when output validation fails', async () => {
    const { calls, generate } = mockSequence([
      {
        text: 'invalid output',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
      },
    ])
    const generateWithRole = gatewayModule.createModelGateway({ generateText: generate as never })

    await assert.rejects(
      () =>
        generateWithRole({
          role: 'content',
          system: 'system',
          prompt: 'prompt',
          validate: () => false,
        }),
      gatewayModule.GatewayValidationError,
    )
    assert.equal(calls.length, 1)
  })

  it('repairs malformed JSON tool call inputs deterministically', () => {
    const fenced = gatewayModule.repairMalformedToolCallJson('```json\n{"a": "hello\nworld", "b": 1,}\n```')
    assert.ok(fenced)
    assert.deepEqual(JSON.parse(fenced), { a: 'hello\nworld', b: 1 })

    assert.equal(gatewayModule.repairMalformedToolCallJson('{not valid at all'), null)
  })

  it('falls back to the next target when step 0 fails on malformed tool call JSON', async () => {
    const jsonParseFailure = Object.assign(new Error('Failed to parse tool call arguments as JSON'), {
      name: 'AI_JSONParseError',
    })
    const { calls, generate } = mockSequence([
      jsonParseFailure,
      {
        text: 'recovered response',
        usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
        finishReason: 'stop',
      },
    ])
    const runTurn = gatewayModule.createAgentTurnRunner({ generateText: generate as never, mode: 'production' })

    const result = await runTurn({
      role: 'director',
      system: 'system',
      prompt: 'prompt',
    })

    assert.equal(calls.length, 2)
    assert.equal(result.provider, 'sovereigneg')
    assert.equal(result.model, 'gpt-6-luna')
    assert.equal(result.text, 'recovered response')
    assert.equal(result.fallback.used, true)
  })

  it('uses vercel/nvidia/nemotron-3.5-lightning-free in test mode for every role', async () => {
    const { calls, generate } = mockSequence([
      {
        text: 'test ok',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
      },
    ])
    const runTurn = gatewayModule.createAgentTurnRunner({ generateText: generate as never })

    const result = await runTurn({ role: 'orchestrator', system: 'system', prompt: 'prompt' })

    assert.equal(calls.length, 1)
    assert.equal(result.provider, 'vercel')
    assert.equal(result.model, 'nvidia/nemotron-3.5-lightning-free')
    assert.equal(result.fallback.used, false)
  })

  it('uses large stepMs and totalMs timeouts for agent turns so tool delegations do not time out at 45s', async () => {
    const { calls, generate } = mockSequence([
      {
        text: 'director ok',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
      },
      {
        text: 'research ok',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
      },
    ])
    const runTurn = gatewayModule.createAgentTurnRunner({ generateText: generate as never })

    await runTurn({ role: 'director', system: 'system', prompt: 'prompt' })
    await runTurn({ role: 'research', system: 'system', prompt: 'prompt' })

    assert.deepEqual(calls[0].timeout, {
      stepMs: gatewayModule.DEFAULT_STEP_TIMEOUT_MS,
      totalMs: gatewayModule.DEFAULT_ORCHESTRATION_TURN_TIMEOUT_MS,
    })
    assert.deepEqual(calls[1].timeout, {
      stepMs: gatewayModule.DEFAULT_STEP_TIMEOUT_MS,
      totalMs: gatewayModule.DEFAULT_AGENT_TURN_TIMEOUT_MS,
    })
    assert.ok(gatewayModule.DEFAULT_STEP_TIMEOUT_MS >= 600_000)
    assert.ok(gatewayModule.DEFAULT_ORCHESTRATION_TURN_TIMEOUT_MS >= 600_000)
    assert.ok(gatewayModule.DEFAULT_AGENT_TURN_TIMEOUT_MS >= 300_000)
  })
})