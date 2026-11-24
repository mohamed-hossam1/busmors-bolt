import test from 'node:test'
import assert from 'node:assert/strict'
import { checkProviderPreflight, estimateSerializedTokens, recordProviderOutcome, resetRateLimiterForTests } from '../../src/server/ai/rate-limiter.ts'
import { TraceCollector } from '../../src/server/observability/collector.ts'
import { toTimelineItem } from '../../src/features/admin/format.ts'
import type { AdminTraceEventRow } from '../../src/features/admin/types.ts'

test('preflight enforces test-mode allowlist and input cap', () => {
  resetRateLimiterForTests()
  const sov = checkProviderPreflight({ provider: 'sovereigneg', model: 'gpt-6-luna', estimatedInputTokens: 500, inputCap: 12000 })
  assert.equal(sov.allowed, false)
  assert.equal(sov.reason, 'disallowed_in_mode')

  const overCap = checkProviderPreflight({ provider: 'groq', model: 'openai/gpt-oss-120b', estimatedInputTokens: 4000, inputCap: 3000 })
  assert.equal(overCap.allowed, false)
  assert.equal(overCap.reason, 'input_cap_exceeded')

  const est = estimateSerializedTokens({ systemPrompt: 'hello', userPrompt: 'world' })
  assert.ok(est > 64)
})

test('rate limiter respects 429 cooldown and rolling TPM ceiling', () => {
  resetRateLimiterForTests()
  const now = 1_000_000
  recordProviderOutcome({ provider: 'dahl', status: 429, headers: new Headers({ 'retry-after': '20' }), now })
  const blocked = checkProviderPreflight({ provider: 'dahl', model: 'deepseek-ai/DeepSeek-V4-Flash-0731', estimatedInputTokens: 500, inputCap: 12000, now: now + 5000 })
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.reason, 'rate_limit_cooldown')

  const unblocked = checkProviderPreflight({ provider: 'dahl', model: 'deepseek-ai/DeepSeek-V4-Flash-0731', estimatedInputTokens: 500, inputCap: 12000, now: now + 21000 })
  assert.equal(unblocked.allowed, true)

  // Groq header-based remaining-token quota check
  recordProviderOutcome({
    provider: 'groq',
    status: 200,
    headers: new Headers({ 'x-ratelimit-remaining-tokens': '200', 'x-ratelimit-reset-tokens': '10s' }),
    now,
  })
  const groqOverTpm = checkProviderPreflight({ provider: 'groq', model: 'openai/gpt-oss-120b', estimatedInputTokens: 600, completionCap: 500, inputCap: 3000, now: now + 1000 })
  assert.equal(groqOverTpm.allowed, false)
  assert.equal(groqOverTpm.reason, 'tpm_limit')

  // Does not double-count systemPrompt when already inside messages
  const est = estimateSerializedTokens({
    systemPrompt: 'A'.repeat(1000),
    messages: [{ role: 'system', content: 'A'.repeat(1000) }, { role: 'user', content: 'hi' }],
  })
  assert.ok(est < 500)
})

test('observability marks missing/failed usage as unknown rather than known zero', async () => {
  const events: AdminTraceEventRow[] = []
  const collector = new TraceCollector(
    { traceId: '11111111-1111-1111-1111-111111111111', request: 'test' },
    { sink: async (_t, ev) => { events.push(...(ev as unknown as AdminTraceEventRow[])) }, enabled: true },
  )
  collector.recordModel({
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    operation: 'director_model',
    attempt: 0,
    usage: null,
    usageKnown: false,
    error: 'provider_error_429',
    errorCategory: 'rate_limit',
  })
  collector.recordModel({
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    operation: 'director_model',
    attempt: 1,
    fallbackUsed: true,
    usage: { inputTokens: 500, outputTokens: 120 },
    usageKnown: true,
  })
  await collector.flush()

  assert.equal(events.length, 2)
  assert.equal((events[0].metadata as Record<string, unknown>).usageStatus, 'unknown')
  assert.equal((events[1].metadata as Record<string, unknown>).usageStatus, 'known')

  const t0 = toTimelineItem(events[0])
  const t1 = toTimelineItem(events[1])
  assert.equal(t0.usageKnown, false)
  assert.equal(t1.usageKnown, true)
})

test('executeWithFallback records each physical attempt, preserves systemPrompt, handles 429 vs 400, and excludes SovereignEG', async () => {
  resetRateLimiterForTests()
  const { executeWithFallback } = await import('../../src/server/ai-generate.ts')
  const prevFetch = globalThis.fetch
  const prevGroq = process.env.GROQ_API_KEY
  const prevDahl = process.env.DAHL_API_KEY
  const prevSov = process.env.SOVEREIGNEG_API_KEY
  process.env.GROQ_API_KEY = 'test-groq-key'
  process.env.DAHL_API_KEY = 'test-dahl-key'
  process.env.SOVEREIGNEG_API_KEY = 'test-sov-key'

  const calls: { url: string; body: Record<string, unknown> }[] = []
  try {
    // Case 1: SovereignEG primary skipped in test mode; Dahl returns 429; Groq succeeds.
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const parsedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url: String(url), body: parsedBody })
      if (String(url).includes('dahl')) {
        return new Response(JSON.stringify({ error: 'rate limit' }), { status: 429, headers: { 'retry-after': '10' } })
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Groq answer' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 120, completion_tokens: 30 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    const res = await executeWithFallback({
      primary: { provider: 'sovereigneg', model: 'gpt-6-luna' },
      fallbacks: [
        { provider: 'dahl', model: 'deepseek-ai/DeepSeek-V4-Flash-0731' },
        { provider: 'groq', model: 'openai/gpt-oss-120b' },
      ],
      request: {
        systemPrompt: 'CANONICAL_SYS_PROMPT',
        userPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
      },
    })

    assert.equal(res.text, 'Groq answer')
    assert.equal(res.target.provider, 'groq')
    assert.equal(res.attempts.length, 2) // Dahl 429 + Groq 200 (SovereignEG never dispatched)
    assert.equal(res.attempts[0].provider, 'dahl')
    assert.equal(res.attempts[0].status, 'failed')
    assert.equal(res.attempts[0].errorCategory, 'rate_limit')
    assert.equal(res.attempts[0].usageKnown, false)
    assert.equal(res.attempts[1].provider, 'groq')
    assert.equal(res.attempts[1].status, 'completed')
    assert.equal(res.attempts[1].usageKnown, true)
    // Verify SovereignEG was never called and systemPrompt was preserved in messages
    assert.equal(calls.some((c) => c.url.includes('sovereigneg')), false)
    const sentMessages = calls[1].body.messages as { role: string; content: string }[]
    assert.equal(sentMessages[0].role, 'system')
    assert.equal(sentMessages[0].content, 'CANONICAL_SYS_PROMPT')

    // Case 2: HTTP 400 invalid_request fails fast without falling back to Groq
    calls.length = 0
    resetRateLimiterForTests()
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      return new Response('bad request schema', { status: 400 })
    }) as typeof fetch

    await assert.rejects(
      () =>
        executeWithFallback({
          primary: { provider: 'dahl', model: 'deepseek-ai/DeepSeek-V4-Flash-0731' },
          fallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }],
          request: { systemPrompt: 'SYS', userPrompt: 'hi' },
        }),
      /provider_error_400/,
    )
    assert.equal(calls.length, 1)
  } finally {
    globalThis.fetch = prevFetch
    if (prevGroq === undefined) delete process.env.GROQ_API_KEY
    else process.env.GROQ_API_KEY = prevGroq
    if (prevDahl === undefined) delete process.env.DAHL_API_KEY
    else process.env.DAHL_API_KEY = prevDahl
    if (prevSov === undefined) delete process.env.SOVEREIGNEG_API_KEY
    else process.env.SOVEREIGNEG_API_KEY = prevSov
    resetRateLimiterForTests()
  }
})
