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
  timeout?: number
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
    const generateWithRole = gatewayModule.createModelGateway({ generateText: generate as never })

    const result = await generateWithRole({
      role: 'content',
      system: 'system',
      prompt: 'prompt',
    })

    assert.equal(calls.length, 2)
    assert.equal(result.provider, 'apinex')
    assert.equal(result.model, 'free/gpt-6-luna')
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
    const generateWithRole = gatewayModule.createModelGateway({ generateText: generate as never })

    const result = await generateWithRole({
      role: 'research',
      system: 'system',
      prompt: 'prompt',
    })

    assert.equal(calls.length, 2)
    assert.equal(result.provider, 'groq')
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
})