import 'server-only'
import { createHash } from 'node:crypto'
import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskOrigin } from '../../lib/contracts'
import type { ExecutionTask } from '../../features/tasks/types'
import type { OrchestratorEventInput } from '../../features/orchestrator/contracts'
import { executeTask } from '../task-executor'
import { taskBackend } from '../task-backend'
import { callOrchestratorModel } from './model'
import { runOrchestrator, type OrchestratorDeps, type OrchestratorInput, type PriorRun } from '../../features/orchestrator/gateway'
import { evaluateGuardrails, detectGreeting } from '../../features/orchestrator/guardrails'
import { retrieveBrain, type BrainReader, type BrainRow } from '../../features/orchestrator/brain-tool'
import { handoffCheckpoint, planDirectorHandoff } from '../../features/orchestrator/director-handoff'
import { buildBrainAnswerPrompt, buildOrchestratePrompt } from '../../features/orchestrator/prompt'
import type { OrchestratorResult } from '../../features/orchestrator/contracts'
import { normalizeDecision } from '../../features/orchestrator/decision'
import { createTraceCollector, type TraceCollector } from '../observability'

/** Fixed server instance id for the synchronous Director handoff. */
const RUNNER_ID = 'a1b2c3d4-0000-4000-8000-000000000001'

export interface RunOrchestratorRequestInput {
  supabase: SupabaseClient
  workspaceId: string
  token: string
  conversationId: string
  request: string
  idempotencyKey: string
  origin?: TaskOrigin
  signal?: AbortSignal
}

function requestHash(request: string, idempotencyKey: string): string {
  return createHash('sha256').update(`${idempotencyKey}::${request}`).digest('hex').slice(0, 128)
}

/** Read-only, tenant-scoped Brain reader backed by approved current nodes. */
export function createBrainReader(supabase: SupabaseClient): BrainReader {
  return {
    async searchApproved({ workspaceId, limit, signal }): Promise<BrainRow[]> {
      const query = supabase
        .from('brain_nodes')
        .select('id, category, title, summary, verification_state')
        .eq('workspace_id', workspaceId)
        .eq('status', 'approved')
        .eq('approval_state', 'approved')
        .eq('is_current', true)
        .limit(limit)
      const { data, error } = signal ? await query.abortSignal(signal) : await query
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: String(row.id),
        category: String(row.category ?? ''),
        title: String(row.title ?? ''),
        summary: String(row.summary ?? ''),
        verificationState: (row.verification_state as string | null) ?? null,
      }))
    },
  }
}

/**
 * Run the full Orchestrator gateway wired to real infrastructure. Returns the
 * outcome plus latency metrics; never throws for expected failures (provider,
 * Brain, timeout) — those become a graceful error/refusal reply.
 */
export async function runOrchestratorRequest(input: RunOrchestratorRequestInput): Promise<OrchestratorResult> {
  const { supabase, workspaceId, token, conversationId, request, idempotencyKey, origin, signal } = input

  const [historyResult, regionResult] = await Promise.all([
    supabase.from('messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(20),
    supabase.from('workspace_settings').select('country, currency, target_market, timezone').eq('workspace_id', workspaceId).maybeSingle(),
  ])
  const history = (historyResult.data ?? []).map((row) => ({ role: String(row.role ?? ''), content: String(row.content ?? '') }))
  const regionRow = (regionResult.data ?? {}) as Record<string, unknown>
  const region = {
    country: (regionRow.country as string) ?? '',
    currency: (regionRow.currency as string) ?? '',
    target_market: (regionRow.target_market as string) ?? '',
    timezone: (regionRow.timezone as string) ?? '',
  }

  const brain = createBrainReader(supabase)

  // Execution observability. The collector buffers a bounded projection with no
  // awaited I/O; it is flushed once the response has been produced (after()).
  const trace: TraceCollector = createTraceCollector({
    traceId: crypto.randomUUID(),
    workspaceId,
    userId: workspaceId,
    conversationId,
    idempotencyKey,
    request,
    route: null,
    origin,
  })

  /** Mirror a customer canvas event into the admin trace (best-effort, in-memory). */
  const mirrorEvent = (event: OrchestratorEventInput) => {
    const base = {
      runId: null,
      attempt: 1,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      error: event.failureReason ?? null,
      parentEventId: event.parentInstanceId ?? null,
    }
    if (event.type === 'tool_call') {
      trace.recordTool({ ...base, toolName: event.agentId, agentId: event.agentId, agentRole: event.agentRole, status: event.status, operation: event.label })
    } else {
      trace.recordAgent({ ...base, agentId: event.agentId, agentRole: event.agentRole, label: event.label, status: event.status })
    }
  }

  const safe = async (label: string, run: () => unknown) => {
    try {
      await run()
    } catch (error) {
      // Persistence is best-effort so a hiccup never swallows the user's answer.
      console.error(`[orchestrator] ${label} failed:`, error instanceof Error ? error.message : error)
    }
  }

  const deps: OrchestratorDeps = {
    guard: (text) => evaluateGuardrails(text),
    greet: (text) => detectGreeting(text),
    async decide(context) {
      const startedAt = new Date().toISOString()
      const result = await callOrchestratorModel({
        operation: 'orchestrate',
        userPrompt: buildOrchestratePrompt({ request: context.request, history: context.history, region: context.region, hint: context.hint }),
        accessToken: token,
        signal: context.signal,
      })
      trace.recordModel({
        provider: result.provider,
        model: result.model,
        operation: 'orchestrate',
        attempt: result.attempt,
        fallbackUsed: result.fallbackUsed,
        usage: result.usage,
        startedAt,
        endedAt: new Date().toISOString(),
        error: result.ok ? null : result.reason ?? result.error ?? 'provider_error',
        outputText: result.ok ? result.text : null,
      })
      if (!result.ok) throw new Error(result.reason ?? 'provider_error')
      return { decision: normalizeDecision(result.text), modelCalls: 1 }
    },
    async retrieveBrain(query, brainSignal) {
      const startedAt = new Date().toISOString()
      const brainResult = await retrieveBrain(brain, workspaceId, query, { limit: 8, candidateLimit: 80, signal: brainSignal })
      trace.recordTool({
        toolName: 'brain',
        agentId: 'brain',
        agentRole: 'tool',
        operation: 'retrieve',
        status: brainResult.ok ? 'completed' : 'failed',
        startedAt,
        endedAt: new Date().toISOString(),
        output: { retrieved: brainResult.retrievedCount, categories: [...new Set(brainResult.facts.map(fact => fact.category))] },
        error: brainResult.ok ? null : brainResult.reason ?? null,
      })
      return brainResult
    },
    async answerFromBrain(context) {
      const startedAt = new Date().toISOString()
      const result = await callOrchestratorModel({
        operation: 'brain_answer',
        userPrompt: buildBrainAnswerPrompt({ request: context.request, query: context.query, facts: context.facts }),
        accessToken: token,
        signal: context.signal,
      })
      trace.recordModel({
        provider: result.provider,
        model: result.model,
        operation: 'brain_answer',
        attempt: result.attempt,
        fallbackUsed: result.fallbackUsed,
        usage: result.usage,
        startedAt,
        endedAt: new Date().toISOString(),
        error: result.ok ? null : result.reason ?? result.error ?? 'provider_error',
        outputText: result.ok ? result.text : null,
      })
      if (!result.ok) throw new Error(result.reason ?? 'provider_error')
      return { reply: result.text, modelCalls: 1 }
    },
    async handoffToDirector(context) {
      const backend = taskBackend(supabase, workspaceId, token)
      const handoff = context.handoff
      const enqueued = (await backend.rpc('enqueue_task', {
        p_conversation_id: context.conversationId,
        p_request: context.request,
        p_origin: context.origin ?? { kind: 'direct', conversationId: context.conversationId },
        p_idempotency_key: context.idempotencyKey,
        p_trace_id: trace.traceId,
      })) as ExecutionTask
      const admitted = (await backend.rpc('admit_task', { p_task_id: enqueued.id, p_runner_id: RUNNER_ID })) as ExecutionTask | null
      if (admitted) {
        const withCheckpoint = (await backend.rpc('checkpoint_task', {
          p_task_id: enqueued.id,
          p_run_id: admitted.run_id,
          p_checkpoint: handoffCheckpoint(handoff),
          p_type: handoff.type,
          p_plan: null,
        })) as ExecutionTask
        trace.setRun(withCheckpoint.run_id, withCheckpoint.attempts)
        await executeTask(backend, withCheckpoint, context.signal ?? new AbortController().signal, trace)
      }
      return { taskId: enqueued.id }
    },
    async findPriorRun(key) {
      try {
        const { data, error } = await supabase.rpc('find_orchestrator_run', { p_idempotency_key: key })
        if (error) return null
        return (data as PriorRun | null) ?? null
      } catch {
        return null
      }
    },
    recordEvent: (event) => { mirrorEvent(event); return safe('record_conversation_event', () => supabase.rpc('record_conversation_event', {
      p_conversation_id: conversationId,
      p_instance_id: event.instanceId,
      p_event_type: event.type,
      p_agent_id: event.agentId,
      p_agent_role: event.agentRole,
      p_label: event.label,
      p_status: event.status,
      p_public_message: event.publicMessage,
      p_parameters: event.parameters ?? {},
      p_failure_reason: event.failureReason ?? null,
      p_started_at: event.startedAt ?? null,
      p_ended_at: event.endedAt ?? null,
      p_parent_instance_id: event.parentInstanceId ?? null,
    })).then(() => undefined)
    },
    recordUserMessage: (content, payload) => safe('append_user_message', () => supabase.rpc('append_conversation_message', {
      p_conversation_id: conversationId,
      p_role: 'user',
      p_type: 'text',
      p_content: content,
      p_payload: payload,
    })).then(() => undefined),
    recordAgentMessage: async (content, type, payload) => {
      try {
        const { data } = await supabase.rpc('append_conversation_message', {
          p_conversation_id: conversationId,
          p_role: 'agent',
          p_type: type,
          p_content: content,
          p_payload: payload,
        })
        return (data as string | null) ?? null
      } catch (error) {
        console.error('[orchestrator] append_agent_message failed:', error instanceof Error ? error.message : error)
        return null
      }
    },
    recordRun: (record) => {
      trace.setResult({ status: record.outcome, route: record.path, finalReply: record.reply || null, durationMs: record.metrics.totalMs })
      return safe('record_orchestrator_run', () => supabase.rpc('record_orchestrator_run', {
      p_conversation_id: conversationId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash(request, idempotencyKey),
      p_outcome: record.outcome,
      p_path: record.path,
      p_task_id: record.taskId,
      p_message_id: record.messageId,
      p_reply: record.reply,
      p_metrics: record.metrics,
    })).then(() => undefined)
    },
  }

  const orchestratorInput: OrchestratorInput = {
    conversationId,
    request,
    idempotencyKey,
    history,
    region,
    origin,
    signal,
  }
  const result = await runOrchestrator(orchestratorInput, deps)
  // Flush after the response is sent: no awaited I/O on the customer path.
  scheduleFlush(trace)
  return result
}

/** Schedule a best-effort trace flush after the response; never throws. */
function scheduleFlush(trace: TraceCollector): void {
  try {
    after(() => trace.flush())
  } catch {
    // Called outside a request scope (e.g. a unit test): fire and forget.
    void trace.flush()
  }
}

export { planDirectorHandoff }