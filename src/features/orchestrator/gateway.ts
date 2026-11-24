// Orchestrator gateway: the single decision-maker every user message passes through.
//
// It is written against injected dependencies so it can be unit-tested with fakes
// and wired to real infrastructure on the server. Responsibilities:
//   - run server-enforced guardrails first (security),
//   - answer exact greetings instantly (no model call),
//   - ask the Orchestrator model to classify intent,
//   - take exactly one path: direct / brain / task,
//   - record truthful execution events (with instance ids) as they happen,
//   - never fabricate completion and always measure latency.
//
// Clean baseline: the task path does not enqueue or execute anything. It returns
// an honest temporary-unavailability reply. The future agent runtime will replace
// this branch.

import type { TaskOrigin } from '../../lib/contracts'
import {
  EMPTY_METRICS,
  type BrainFact,
  type BrainRetrieval,
  type GuardrailResult,
  type OrchestratorEventInput,
  type OrchestratorMetrics,
  type OrchestratorOutcome,
  type OrchestratorPath,
  type OrchestratorResult,
} from './contracts'
import { capabilityUnavailableReply, REFUSAL_BRAIN_UNAVAILABLE } from './prompt'

export interface OrchestratorInput {
  conversationId: string
  request: string
  idempotencyKey: string
  history: { role: string; content: string }[]
  region: { country?: string; currency?: string; target_market?: string; timezone?: string }
  origin?: TaskOrigin
  signal?: AbortSignal
}

export interface DecideContext {
  request: string
  history: { role: string; content: string }[]
  region: OrchestratorInput['region']
  hint: GuardrailResult['hint']
  signal?: AbortSignal
}

export interface DecideResult {
  decision: import('./contracts').OrchestratorDecision
  modelCalls: number
}

export interface BrainAnswerContext {
  request: string
  query: string
  facts: BrainFact[]
  history: { role: string; content: string }[]
  signal?: AbortSignal
}

export interface BrainAnswerResult {
  reply: string
  modelCalls: number
}

export interface PriorRun {
  outcome: OrchestratorOutcome
  path: OrchestratorPath | null
  taskId: string | null
  messageId: string | null
  reply: string
  metrics: OrchestratorMetrics
}

export interface RunRecord {
  outcome: OrchestratorOutcome
  path: OrchestratorPath | null
  taskId: string | null
  messageId: string | null
  reply: string
  metrics: OrchestratorMetrics
}

export interface OrchestratorDeps {
  guard(request: string): GuardrailResult
  greet(request: string): { lang: 'en' | 'ar'; reply: string } | null
  decide(context: DecideContext): Promise<DecideResult>
  retrieveBrain(query: string, signal?: AbortSignal): Promise<BrainRetrieval>
  answerFromBrain(context: BrainAnswerContext): Promise<BrainAnswerResult>
  findPriorRun(idempotencyKey: string): Promise<PriorRun | null>
  recordEvent(event: OrchestratorEventInput): Promise<void>
  recordUserMessage(content: string, payload: Record<string, unknown>): Promise<void>
  recordAgentMessage(content: string, type: string, payload: Record<string, unknown>): Promise<string | null>
  recordRun(record: RunRecord): Promise<void>
}

export interface RunOptions {
  now?: () => number
}

const GENERIC_DIRECT_FALLBACK = 'How can I help you with your business?'
const ERROR_MESSAGE = 'I couldn’t complete that just now. Please try again in a moment.'

function iso(now: () => number): string {
  return new Date(now()).toISOString()
}

function metrics(partial: Partial<OrchestratorMetrics>): OrchestratorMetrics {
  return { ...EMPTY_METRICS, ...partial }
}

export async function runOrchestrator(
  input: OrchestratorInput,
  deps: OrchestratorDeps,
  options: RunOptions = {},
): Promise<OrchestratorResult> {
  const now = options.now ?? Date.now
  const startedAt = now()
  const signal = input.signal

  // 0. Idempotent replay: never run the same message twice.
  const prior = await deps.findPriorRun(input.idempotencyKey)
  if (prior) {
    return {
      outcome: prior.outcome,
      path: prior.path,
      taskId: prior.taskId,
      messageId: prior.messageId,
      reply: prior.reply,
      metrics: prior.metrics,
    }
  }

  const guard = deps.guard(input.request)

  const finish = async (
    outcome: OrchestratorOutcome,
    path: OrchestratorPath | null,
    taskId: string | null,
    messageId: string | null,
    reply: string,
    runMetrics: OrchestratorMetrics,
  ): Promise<OrchestratorResult> => {
    const finalMetrics = { ...runMetrics, totalMs: now() - startedAt }
    await deps.recordRun({ outcome, path, taskId, messageId, reply, metrics: finalMetrics })
    return { outcome, path, taskId, messageId, reply, metrics: finalMetrics }
  }

  // 1. Server-enforced refusal (prompt injection, secrets, override, off-topic).
  if (guard.action === 'refuse' || guard.action === 'out_of_scope') {
    const orchestratorId = crypto.randomUUID()
    await deps.recordEvent({ type: 'agent_started', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Understanding your request', status: 'running', publicMessage: 'Understanding your request', parentInstanceId: null, startedAt: iso(() => startedAt) })
    await deps.recordEvent({ type: 'agent_error', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Request declined', status: 'failed', publicMessage: guard.message, failureReason: guard.reason, parentInstanceId: null, startedAt: iso(() => startedAt), endedAt: iso(now) })
    await deps.recordUserMessage(input.request, { orchestrator: true, outcome: guard.action })
    const messageId = await deps.recordAgentMessage(guard.message, 'error', { outcome: guard.action, reason: guard.reason })
    return finish('refuse', null, null, messageId, guard.message, metrics({}))
  }

  const orchestratorId = crypto.randomUUID()
  const startedIso = iso(() => startedAt)

  // 2. Instant greeting: direct answer with zero model calls.
  const greeting = deps.greet(input.request)
  if (greeting) {
    await deps.recordEvent({ type: 'agent_started', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Understanding your request', status: 'running', publicMessage: 'Understanding your request', parentInstanceId: null, startedAt: startedIso })
    await deps.recordEvent({ type: 'agent_completed', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Answered directly', status: 'completed', publicMessage: 'Answered directly', parentInstanceId: null, startedAt: startedIso, endedAt: iso(now) })
    await deps.recordUserMessage(input.request, { orchestrator: true, outcome: 'direct' })
    const messageId = await deps.recordAgentMessage(greeting.reply, 'text_response', { outcome: 'direct' })
    return finish('direct', 'direct', null, messageId, greeting.reply, metrics({}))
  }

  // 3. Ask the Orchestrator model to classify intent (one call).
  try {
    await deps.recordEvent({ type: 'agent_started', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Understanding your request', status: 'running', publicMessage: 'Understanding your request', parentInstanceId: null, startedAt: startedIso })
    const decideStart = now()
    const decided = await deps.decide({ request: input.request, history: input.history, region: input.region, hint: guard.hint, signal })
    const decisionMs = now() - decideStart
    const decision = decided.decision
    const decisionModelCalls = decided.modelCalls
    const baseMetrics = metrics({ decisionMs, modelCalls: decisionModelCalls })

    // 3a. Direct response.
    if (decision.path === 'direct') {
      const reply = decision.reply.trim() || GENERIC_DIRECT_FALLBACK
      await deps.recordEvent({ type: 'agent_completed', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Answered directly', status: 'completed', publicMessage: 'Answered directly', parentInstanceId: null, startedAt: startedIso, endedAt: iso(now) })
      await deps.recordUserMessage(input.request, { orchestrator: true, outcome: 'direct' })
      const messageId = await deps.recordAgentMessage(reply, 'text_response', { outcome: 'direct' })
      return finish('direct', 'direct', null, messageId, reply, baseMetrics)
    }

    // 3b. Brain knowledge retrieval.
    if (decision.path === 'brain') {
      const query = (decision.brainQuery || input.request).trim()
      const brainId = crypto.randomUUID()
      await deps.recordEvent({ type: 'tool_call', instanceId: brainId, agentId: 'brain', agentRole: 'tool', label: 'Brain retrieval', status: 'running', publicMessage: 'Searching company knowledge', parentInstanceId: orchestratorId, startedAt: iso(now) })
      const brainStart = now()
      const brain = await deps.retrieveBrain(query, signal)
      const brainMs = now() - brainStart
      const found = brain.ok && brain.retrievedCount > 0
      await deps.recordEvent({
        type: 'agent_completed', instanceId: brainId, agentId: 'brain', agentRole: 'tool', label: 'Brain retrieval',
        status: brain.ok ? 'completed' : 'failed',
        publicMessage: brain.ok ? (found ? `Found ${brain.retrievedCount} relevant fact(s)` : 'No matching company facts') : 'Brain retrieval unavailable',
        parentInstanceId: orchestratorId, startedAt: iso(now), endedAt: iso(now),
        failureReason: brain.ok ? null : (brain.reason ?? 'brain_unavailable'),
      })

      let reply: string
      let brainModelCalls = 0
      let brainAnswerMs = 0
      if (brain.ok) {
        const answerStart = now()
        const answered = await deps.answerFromBrain({ request: input.request, query, facts: brain.facts, history: input.history, signal })
        brainAnswerMs = now() - answerStart
        reply = answered.reply.trim() || REFUSAL_BRAIN_UNAVAILABLE
        brainModelCalls = answered.modelCalls
      } else {
        // Graceful, honest failure: never fabricate company facts.
        reply = REFUSAL_BRAIN_UNAVAILABLE
      }
      const answeredLabel = brain.ok ? 'Answered from company knowledge' : 'Brain temporarily unavailable'
      await deps.recordEvent({ type: 'agent_completed', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: answeredLabel, status: 'completed', publicMessage: answeredLabel, parentInstanceId: null, startedAt: startedIso, endedAt: iso(now) })
      await deps.recordUserMessage(input.request, { orchestrator: true, outcome: 'brain', brainQuery: query, factCount: brain.retrievedCount })
      const messageId = await deps.recordAgentMessage(reply, 'text_response', { outcome: 'brain', brainQuery: query, factCount: brain.retrievedCount })
      const runMetrics = metrics({ decisionMs, brainMs: brainMs + brainAnswerMs, modelCalls: decisionModelCalls + brainModelCalls, brainCalls: 1 })
      return finish('brain', 'brain', null, messageId, reply, runMetrics)
    }

    // 3c. Task requests: honest temporary unavailability. No task, no deliverable.
    const unavailableReply = capabilityUnavailableReply(input.request)
    await deps.recordEvent({ type: 'agent_completed', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Capability temporarily unavailable', status: 'completed', publicMessage: 'Capability temporarily unavailable', parentInstanceId: null, startedAt: startedIso, endedAt: iso(now) })
    await deps.recordUserMessage(input.request, { orchestrator: true, outcome: 'direct', unavailable: true })
    const messageId = await deps.recordAgentMessage(unavailableReply, 'text_response', { outcome: 'direct', unavailable: true, intent: decision.intent })
    return finish('direct', 'direct', null, messageId, unavailableReply, baseMetrics)
  } catch (error) {
    try {
      await deps.recordEvent({ type: 'agent_error', instanceId: orchestratorId, agentId: 'orchestrator', agentRole: 'orchestrator', label: 'Processing failed', status: 'failed', publicMessage: ERROR_MESSAGE, failureReason: error instanceof Error ? error.message : 'orchestrator_error', parentInstanceId: null, startedAt: startedIso, endedAt: iso(now) })
      await deps.recordUserMessage(input.request, { orchestrator: true, outcome: 'error' })
      const messageId = await deps.recordAgentMessage(ERROR_MESSAGE, 'error', { outcome: 'error' })
      return finish('error', null, null, messageId, ERROR_MESSAGE, metrics({}))
    } catch {
      // Persistence itself failed; still return a safe, honest error to the user.
      return { outcome: 'error', path: null, taskId: null, messageId: null, reply: ERROR_MESSAGE, metrics: metrics({}) }
    }
  }
}

/** Node instance ids shared by the gateway and historical event readers. */
export const ORCHESTRATOR_AGENT_ID = 'orchestrator'
export const BRAIN_AGENT_ID = 'brain'