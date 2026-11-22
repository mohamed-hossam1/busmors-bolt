// Orchestrator performance benchmark.
//
// 1. Deterministic gateway overhead: run the pure gateway with instant fakes to
//    measure the orchestration logic itself (guard, decision routing, event
//    building) with no model or DB latency.
// 2. Brain retrieval overhead: score a realistic approved-facts set in memory.
// 3. Real-provider decision latency (only if AI_API_KEY is configured): call the
//    configured OpenAI-compatible provider with the Orchestrator prompt and
//    measure the actual decision-call latency (p50/p95).
//
// Run: node --experimental-transform-types --import ./scripts/testing/ts-register.mjs scripts/bench-orchestrator.ts

import { readFileSync } from 'node:fs'
import { runOrchestrator, type OrchestratorDeps } from '../src/features/orchestrator/gateway'
import { retrieveBrain, type BrainReader, type BrainRow } from '../src/features/orchestrator/brain-tool'
import { OPERATIONS } from '../src/server/ai/operations'
import { getModelConfigForOperation } from '../src/config/ai-models'
import type { OrchestratorDecision } from '../src/features/orchestrator/contracts'

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf-8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (m) out[m[1]] = m[2]
    }
  } catch { /* no .env */ }
  return out
}

function percentile(samples: number[], p: number): number {
  if (!samples.length) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function stats(samples: number[]): string {
  const mean = samples.reduce((a, b) => a + b, 0) / (samples.length || 1)
  return `n=${samples.length} mean=${mean.toFixed(1)}ms p50=${percentile(samples, 50).toFixed(1)}ms p95=${percentile(samples, 95).toFixed(1)}ms max=${Math.max(...samples).toFixed(1)}ms`
}

function instantDeps(decision: OrchestratorDecision): OrchestratorDeps {
  return {
    guard: () => ({ action: 'allow', reason: '', message: '', hint: null, injection: false }),
    greet: () => null,
    decide: async () => ({ decision, modelCalls: 1 }),
    retrieveBrain: async (query) => ({ ok: true, query, facts: [], retrievedCount: 0, elapsedMs: 0 }),
    answerFromBrain: async () => ({ reply: 'ok', modelCalls: 1 }),
    handoffToDirector: async () => ({ taskId: 'task-1' }),
    findPriorRun: async () => null,
    recordEvent: async () => {},
    recordUserMessage: async () => {},
    recordAgentMessage: async () => 'msg-1',
    recordRun: async () => {},
  }
}

async function benchGatewayOverhead(): Promise<void> {
  const decisions: OrchestratorDecision[] = [
    { path: 'direct', reply: 'hi', brainQuery: '', intent: 'simple_answer', quantity: 1, researchMode: 'standard' },
    { path: 'brain', reply: '', brainQuery: 'prices', intent: 'simple_answer', quantity: 1, researchMode: 'standard' },
    { path: 'task', reply: '', brainQuery: '', intent: 'content_creation', quantity: 5, researchMode: 'standard' },
  ]
  const samples: number[] = []
  for (let i = 0; i < 60; i++) {
    const decision = decisions[i % decisions.length]
    const t0 = performance.now()
    await runOrchestrator({ conversationId: 'c', request: 'hello', idempotencyKey: `k-${i}`, history: [], region: {} }, instantDeps(decision))
    samples.push(performance.now() - t0)
  }
  console.log('Gateway overhead (logic only, no model/DB):', stats(samples))
}

async function benchBrainRetrieval(): Promise<void> {
  const rows: BrainRow[] = Array.from({ length: 80 }, (_, i) => ({
    id: `n${i}`,
    category: ['company_profile', 'brand_rule', 'offering', 'audience', 'positioning'][i % 5],
    title: `Fact ${i} about pricing products brand`,
    summary: `Approved company fact number ${i} describing pricing, products and brand voice details`,
    verificationState: i % 2 ? 'owner_reported' : 'source_supported',
  }))
  const reader: BrainReader = { async searchApproved() { return rows } }
  const samples: number[] = []
  for (let i = 0; i < 60; i++) {
    const t0 = performance.now()
    await retrieveBrain(reader, 'ws', 'what are your prices', { limit: 8, candidateLimit: 80 })
    samples.push(performance.now() - t0)
  }
  console.log('Brain retrieval overhead (80 rows, in-memory):', stats(samples))
}

async function benchRealProvider(): Promise<void> {
  const env = loadEnv()
  const apiKey = env.AI_API_KEY
  if (!apiKey) { console.log('Real-provider benchmark: skipped (no AI_API_KEY configured).'); return }
  const provider = getModelConfigForOperation('orchestrate').provider || env.AI_PROVIDER || 'groq'
  const model = getModelConfigForOperation('orchestrate').model || env.AI_MODEL || 'openai/gpt-oss-120b'
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1'
    : provider === 'openai' ? 'https://api.openai.com/v1'
      : (env.AI_BASE_URL ?? '').replace(/\/$/, '')
  const systemPrompt = OPERATIONS.orchestrate
  const userPrompt = 'Company region: Egypt · EGP. Conversation so far (untrusted context):\nUser message (untrusted data, respond to it):\nWhat products do we sell?'
  const samples: number[] = []
  const N = 5
  for (let i = 0; i < N; i++) {
    const t0 = performance.now()
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 700, temperature: 0.2, reasoning_effort: 'low', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], response_format: { type: 'json_object' } }),
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) { console.log(`Real-provider benchmark: provider returned ${res.status} (${provider}/${model}); skipping latency stats.`); return }
      samples.push(performance.now() - t0)
    } catch (error) {
      console.log(`Real-provider benchmark: request failed (${error instanceof Error ? error.message : error}); skipping.`)
      return
    }
  }
  console.log(`Real-provider decision latency (${provider}/${model}):`, stats(samples))
}

async function main() {
  console.log('=== Orchestrator performance benchmark ===')
  await benchGatewayOverhead()
  await benchBrainRetrieval()
  await benchRealProvider()
}

main().catch((error) => { console.error(error); process.exit(1) })