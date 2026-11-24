import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { after } from 'next/server'
import type { TaskOrigin } from '../../lib/contracts'
import { ORCHESTRATOR_V2_SYSTEM_PROMPT } from '../../features/orchestrator/prompt'
import { runOrchestratorV2, buildOrchestratorContext, type ModelMessage } from '../../features/orchestrator/v2-runtime'
import { evaluateGuardrails, detectGreeting, AR_GREETING_REPLY, EN_GREETING_REPLY } from '../../features/orchestrator/guardrails'
import { REFUSAL_BRAIN_UNAVAILABLE } from '../../features/orchestrator/prompt'
import { createTraceCollector, type TraceCollector } from '../observability'
import { callOrchestratorV2Model, type ToolDef } from './model'
import { buildToolRegistry } from '../employee/tools'
import { createToolServices } from '../employee/tool-services'
import { SkillRegistry } from '../employee/skills-registry'
import { emitModelAttempts, executeDirector } from '../employee/agent-executor'
import { retrieveBrain, type BrainReader, type BrainRow } from '../../features/orchestrator/brain-tool'
import type { OrchestratorResult } from '../../features/orchestrator/contracts'

export interface RunOrchestratorV2Input {
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

/**
 * Conservative safety filter for the deterministic persistence net.
 *
 * This is NOT marketing intelligence: it is a narrow guard against one specific
 * failure mode — the Director producing publishable social posts but failing to
 * call create_or_update_post_draft. Such content must NEVER be filed as a
 * Deliverable (spec §3.9/§5.6: posts are Calendar drafts, not Deliverables).
 * When in doubt the filter returns false (so genuine reports still persist); it
 * only returns true on an unambiguous post-shaped signal (multiple hashtag
 * blocks or repeated caption/post/reel/story markers).
 */
export function looksLikeSocialPosts(text: string): boolean {
  const sample = text.slice(0, 8000)
  const hashtagLines = (sample.match(/#[\p{L}\p{N}_]+/gu) ?? []).length
  const captionMarkers = (sample.match(/\b(caption|post|reel|story|carousel|slide|script)\b/gi) ?? []).length
  const platformMentions = (sample.match(/\b(facebook|instagram|tiktok|threads|linkedin|reels?)\b/gi) ?? []).length
  if (hashtagLines >= 3) return true
  if (captionMarkers >= 3 && platformMentions >= 1) return true
  return false
}

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

/** Build the compact tool catalog the model sees (Orchestrator's 5 capabilities). */
function orchestratorToolDefs(): ToolDef[] {
  const services = {} as ReturnType<typeof createToolServices>
  const registry = buildToolRegistry(services)
  return registry.catalogForRole('orchestrator').map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.schema,
  }))
}

/**
 * Orchestrator V2 server entry: native tool-calling loop for the five approved
 * capabilities. Preserves idempotency, conversation recording, guardrails and
 * honest unavailability when the Director is not yet wired.
 */
export async function runOrchestratorV2Request(input: RunOrchestratorV2Input): Promise<OrchestratorResult> {
  const { supabase, workspaceId, token, conversationId, request, idempotencyKey, origin, signal } = input
  const startedAt = Date.now()

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
  const orchestratorInstanceId = crypto.randomUUID()
  trace.recordAgent({ agentId: 'orchestrator', agentRole: 'orchestrator', instanceId: orchestratorInstanceId, label: 'Orchestrator', status: 'running', startedAt: new Date().toISOString() })

  const finish = (outcome: OrchestratorResult['outcome'], path: OrchestratorResult['path'], taskId: string | null, messageId: string | null, reply: string): OrchestratorResult => {
    const totalMs = Date.now() - startedAt
    trace.setResult({ status: outcome, route: path, finalReply: reply || null, durationMs: totalMs })
    return { outcome, path, taskId, messageId, reply, metrics: { decisionMs: totalMs, brainMs: 0, totalMs, modelCalls: 0, brainCalls: 0 } }
  }

  const recordUser = async (content: string, payload: Record<string, unknown>) => {
    try { await supabase.rpc('append_conversation_message', { p_conversation_id: conversationId, p_role: 'user', p_type: 'text', p_content: content, p_payload: payload }) } catch { /* best effort */ }
  }
  const recordAgent = async (content: string, type: string, payload: Record<string, unknown>): Promise<string | null> => {
    try {
      const { data } = await supabase.rpc('append_conversation_message', { p_conversation_id: conversationId, p_role: 'agent', p_type: type, p_content: content, p_payload: payload })
      return (data as string | null) ?? null
    } catch { return null }
  }

  // Idempotent replay.
  try {
    const { data: prior } = await supabase.rpc('find_orchestrator_run', { p_idempotency_key: idempotencyKey })
    if (prior) {
      const p = prior as { outcome: OrchestratorResult['outcome']; path: OrchestratorResult['path']; task_id: string | null; message_id: string | null; reply: string }
      return finish(p.outcome, p.path, p.task_id, p.message_id, p.reply)
    }
  } catch { /* no prior run */ }

  // Guardrails (server-enforced security boundary).
  const guard = evaluateGuardrails(request)
  if (guard.action === 'refuse' || guard.action === 'out_of_scope') {
    await recordUser(request, { orchestrator: true, outcome: guard.action })
    const messageId = await recordAgent(guard.message, 'error', { outcome: guard.action, reason: guard.reason })
    return finish('refuse', null, null, messageId, guard.message)
  }

  // Instant greeting (zero model calls).
  const greeting = detectGreeting(request)
  if (greeting) {
    await recordUser(request, { orchestrator: true, outcome: 'direct' })
    const messageId = await recordAgent(greeting.reply, 'text_response', { outcome: 'direct' })
    return finish('direct', 'direct', null, messageId, greeting.reply)
  }

  // Load trusted context: history, region, Brain, product knowledge.
  const [historyResult, regionResult] = await Promise.all([
    supabase.from('messages').select('role, content').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(20),
    supabase.from('workspace_settings').select('country, currency, target_market, timezone').eq('workspace_id', workspaceId).maybeSingle(),
  ])
  const history = (historyResult.data ?? []).map((row) => ({ role: String(row.role ?? ''), content: String(row.content ?? '') }))
  const regionRow = (regionResult.data ?? {}) as Record<string, unknown>
  const region = { country: (regionRow.country as string) ?? '', currency: (regionRow.currency as string) ?? '', target_market: (regionRow.target_market as string) ?? '' }

  const services = createToolServices(supabase, workspaceId)
  // Phase 4: wire delegate_to_director to the real Director runtime. The Director
  // runs inline (bounded), emitting agent/skill/tool/model events into this trace.
  const skills = await SkillRegistry.create()
  const directorInstanceId = crypto.randomUUID()
  let directorOutcome: {
    summary: string
    deliverablesSaved: number
    postDraftsSaved: number
    postsDetected: boolean
    fabricatedSources: boolean
  } | null = null
  services.delegateToDirector = async (handoff) => {
    const directorStart = new Date().toISOString()
    trace.recordAgent({ agentId: 'director', agentRole: 'director', instanceId: directorInstanceId, parentEventId: orchestratorInstanceId, label: 'Director', status: 'running', startedAt: directorStart, input: { originalRequest: handoff.originalRequest } })
    let deliverablesSaved = 0
    let postDraftsSaved = 0
    const result = await executeDirector(
      {
        supabase,
        workspaceId,
        token,
        signal,
        onAgent: (info) => {
          trace.recordAgent({
            agentId: info.role,
            agentRole: info.role,
            instanceId: info.instanceId,
            parentEventId: info.parentEventId ?? directorInstanceId,
            label: info.label,
            status: info.status,
            startedAt: info.startedAt,
            endedAt: info.endedAt,
            input: info.input,
            output: info.output,
            error: info.error,
          })
        },
        onModel: (info) => {
          const targetInstanceId = info.instanceId ?? directorInstanceId
          trace.recordModel({
            provider: info.provider,
            model: info.model,
            operation: `${info.role}_model`,
            attempt: info.attempt,
            fallbackUsed: info.fallbackUsed,
            usage: info.usage as { inputTokens?: number; outputTokens?: number },
            usageKnown: info.usageKnown,
            status: info.status,
            errorCategory: info.errorCategory,
            startedAt: info.startedAt,
            endedAt: info.endedAt,
            error: info.error,
            input: info.input,
            outputText: info.outputText,
            instanceId: targetInstanceId,
            parentEventId: targetInstanceId,
          })
        },
        onTool: (info) => {
          const targetInstanceId = info.instanceId ?? directorInstanceId
          trace.recordTool({
            toolName: info.tool,
            agentId: info.tool,
            agentRole: 'tool',
            operation: info.role,
            status: info.ok ? 'completed' : 'failed',
            startedAt: info.startedAt,
            endedAt: info.endedAt,
            input: info.input,
            output: info.output,
            error: info.error,
            instanceId: targetInstanceId,
            parentEventId: targetInstanceId,
          })
          if (info.ok && info.tool === 'create_or_version_deliverable') deliverablesSaved += 1
          if (info.ok && info.tool === 'create_or_update_post_draft') postDraftsSaved += 1
        },
        onSkill: (info) => {
          const targetInstanceId = info.instanceId ?? directorInstanceId
          trace.recordSkill({
            skillId: info.skillId,
            role: info.role,
            version: info.version,
            contentHash: info.contentHash,
            status: info.ok ? 'completed' : 'failed',
            instanceId: targetInstanceId,
            parentEventId: targetInstanceId,
          })
        },
      },
      skills,
      {
        directorInstanceId,
        originalRequest: handoff.originalRequest,
        intendedOutcome: handoff.intendedOutcome,
        contextBlock,
        requestedLanguage: handoff.outputLanguage,
      },
    )
    // Deterministic persistence safety net (spec §3.6/§3.9/§7): never lose
    // substantial work, NEVER misfile publishable posts as Deliverables, and
    // NEVER persist unretrieved/fabricated external sources.
    let postsDetected = false
    let fabricatedSources = result.ungroundedUrls.length > 0
    if ((result.status === 'completed' || result.status === 'partial') && deliverablesSaved === 0 && postDraftsSaved === 0 && result.summary.trim().length >= 200) {
      if (fabricatedSources) {
        trace.recordTool({ toolName: 'create_or_version_deliverable', agentId: 'create_or_version_deliverable', agentRole: 'tool', operation: 'director_safety_net', status: 'skipped', startedAt: directorStart, endedAt: new Date().toISOString(), output: { skipped: true, reason: 'unverified_external_sources_not_persisted', ungroundedUrls: result.ungroundedUrls }, instanceId: directorInstanceId, parentEventId: directorInstanceId })
      } else if (looksLikeSocialPosts(result.summary)) {
        postsDetected = true
        trace.recordTool({ toolName: 'create_or_version_deliverable', agentId: 'create_or_version_deliverable', agentRole: 'tool', operation: 'director_safety_net', status: 'skipped', startedAt: directorStart, endedAt: new Date().toISOString(), output: { skipped: true, reason: 'post_shaped_output_not_filed_as_deliverable' }, instanceId: directorInstanceId, parentEventId: directorInstanceId })
      } else {
        const saved = await services.createDeliverable({
          title: handoff.intendedOutcome || 'Marketing result',
          type: 'general',
          content: result.summary,
          taskId: null,
          sourceRefs: result.evidenceRefs,
        })
        if (saved.ok) { deliverablesSaved += 1; trace.recordTool({ toolName: 'create_or_version_deliverable', agentId: 'create_or_version_deliverable', agentRole: 'tool', operation: 'director_safety_net', status: 'completed', startedAt: directorStart, endedAt: new Date().toISOString(), output: { deliverableId: saved.id, safetyNet: true }, instanceId: directorInstanceId, parentEventId: directorInstanceId }) }
        else trace.recordTool({ toolName: 'create_or_version_deliverable', agentId: 'create_or_version_deliverable', agentRole: 'tool', operation: 'director_safety_net', status: 'failed', startedAt: directorStart, endedAt: new Date().toISOString(), error: saved.error ?? 'safety-net persistence failed', instanceId: directorInstanceId, parentEventId: directorInstanceId })
      }
    }
    directorOutcome = { summary: result.summary, deliverablesSaved, postDraftsSaved, postsDetected, fabricatedSources }
    const directorStatus = fabricatedSources ? 'partial' : result.status
    trace.recordAgent({ agentId: 'director', agentRole: 'director', instanceId: directorInstanceId, parentEventId: orchestratorInstanceId, label: 'Director', status: directorStatus, endedAt: new Date().toISOString(), output: { summary: result.summary, deliverablesSaved, postDraftsSaved, fabricatedSources, loadedSkills: result.loadedSkills, invokedTools: result.invokedTools } })
    return { ok: result.status === 'completed' || result.status === 'partial', taskId: directorInstanceId }
  }
  const registry = buildToolRegistry(services)

  const brain = createBrainReader(supabase)
  const brainResult = await retrieveBrain(brain, workspaceId, request, { limit: 8, candidateLimit: 80, signal })
  trace.recordTool({ toolName: 'brain', agentId: 'brain', agentRole: 'tool', operation: 'retrieve', status: brainResult.ok ? 'completed' : 'failed', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), output: { retrieved: brainResult.retrievedCount }, error: brainResult.ok ? null : brainResult.reason ?? null })
  const productKnowledge = await services.getProductKnowledge()
  const contextBlock = buildOrchestratorContext({ brainFacts: brainResult.facts, productKnowledge, region })

  // Tool executor bound to this trace + instance.
  const executeTool = async (name: string, args: Record<string, unknown>) => {
    const toolStart = new Date().toISOString()
    const result = await registry.execute('orchestrator', name, args, { workspaceId, instanceId: orchestratorInstanceId, signal, services })
    trace.recordTool({ toolName: name, agentId: name, agentRole: 'tool', operation: 'orchestrate_v2', status: result.ok ? 'completed' : 'failed', startedAt: toolStart, endedAt: new Date().toISOString(), input: args, output: result.ok ? result.output : { error: result.error }, error: result.ok ? null : result.error, instanceId: orchestratorInstanceId, parentEventId: orchestratorInstanceId })
    return result.ok ? { ok: true, output: result.output } : { ok: false, error: result.error }
  }

  // Model turn adapter (records every physical attempt).
  const model = async (messages: ModelMessage[], modelSignal?: AbortSignal) => {
    const modelStart = new Date().toISOString()
    const result = await callOrchestratorV2Model({ systemPrompt: ORCHESTRATOR_V2_SYSTEM_PROMPT, messages, tools: orchestratorToolDefs(), accessToken: token, signal: modelSignal })
    const lastUser = messages[messages.length - 1]?.content ?? ''
    emitModelAttempts(
      (info) => trace.recordModel({
        provider: info.provider,
        model: info.model,
        operation: 'orchestrate_v2',
        attempt: info.attempt,
        fallbackUsed: info.fallbackUsed,
        usage: info.usage as { inputTokens?: number; outputTokens?: number },
        usageKnown: info.usageKnown,
        status: info.status,
        errorCategory: info.errorCategory,
        startedAt: info.startedAt,
        endedAt: info.endedAt,
        error: info.error,
        input: info.input,
        outputText: info.outputText,
        instanceId: orchestratorInstanceId,
        parentEventId: orchestratorInstanceId,
      }),
      'orchestrator',
      orchestratorInstanceId,
      ORCHESTRATOR_V2_SYSTEM_PROMPT,
      lastUser,
      result,
      modelStart,
      new Date().toISOString(),
    )
    if (!result.ok) throw new Error(result.reason ?? 'provider_error')
    return { text: result.text, toolCalls: result.toolCalls }
  }

  try {
    const outcome = await runOrchestratorV2({ systemPrompt: ORCHESTRATOR_V2_SYSTEM_PROMPT, request, history, contextBlock, signal }, { model, executeTool, now: Date.now })

    let finalReply = outcome.reply
    const dOut = directorOutcome as { summary: string; deliverablesSaved: number; postDraftsSaved: number; postsDetected: boolean; fabricatedSources: boolean } | null
    if (outcome.kind === 'delegated' && dOut) {
      const summary = dOut.summary.trim()
      if (dOut.fabricatedSources) {
        finalReply = `${outcome.reply}\n\nI couldn’t verify external sources for this request, so I have not saved it. The draft below cites sources that were not actually retrieved and should not be relied on:\n\n${summary.slice(0, 1200)}`
      } else if (dOut.deliverablesSaved > 0 && dOut.postDraftsSaved > 0) {
        finalReply = `${outcome.reply}\n\n${summary.slice(0, 1800)}${summary.length > 1800 ? '…' : ''}\n\n(saved to Deliverables and Calendar drafts)`
      } else if (dOut.deliverablesSaved > 0) {
        finalReply = `${outcome.reply}\n\n${summary.slice(0, 1800)}${summary.length > 1800 ? '…' : ''}\n\n(saved to Deliverables)`
      } else if (dOut.postDraftsSaved > 0) {
        finalReply = `${outcome.reply}\n\n${summary.slice(0, 4000)}\n\n(saved ${dOut.postDraftsSaved} draft(s) to Calendar)`
      } else if (dOut.postsDetected && summary) {
        finalReply = `${outcome.reply}\n\n${summary.slice(0, 4000)}`
      } else if (summary) {
        finalReply = `${outcome.reply}\n\n${summary.slice(0, 1800)}${summary.length > 1800 ? '…' : ''}`
      }
    }

    trace.recordAgent({ agentId: 'orchestrator', agentRole: 'orchestrator', instanceId: orchestratorInstanceId, label: 'Orchestrator', status: outcome.kind === 'error' ? 'failed' : 'completed', endedAt: new Date().toISOString() })

    await recordUser(request, { orchestrator: true, outcome: outcome.kind })
    const messageId = await recordAgent(finalReply, 'text_response', { outcome: outcome.kind, taskId: 'taskId' in outcome ? outcome.taskId : null })

    // Persist the run for idempotency.
    try {
      await supabase.rpc('record_orchestrator_run', {
        p_conversation_id: conversationId,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash(request, idempotencyKey),
        p_outcome: outcome.kind === 'delegated' ? 'task' : outcome.kind === 'error' ? 'error' : 'direct',
        p_path: outcome.kind === 'delegated' ? 'task' : 'direct',
        p_task_id: 'taskId' in outcome ? outcome.taskId : null,
        p_message_id: messageId,
        p_reply: finalReply,
        p_metrics: { decisionMs: Date.now() - startedAt, brainMs: 0, totalMs: Date.now() - startedAt, modelCalls: 1, brainCalls: 1 },
      })
    } catch { /* best effort */ }

    const result: OrchestratorResult = outcome.kind === 'delegated'
      ? finish('direct', 'direct', outcome.taskId, messageId, finalReply)
      : outcome.kind === 'error'
        ? finish('error', null, null, messageId, finalReply)
        : finish('direct', 'direct', null, messageId, finalReply)
    scheduleFlush(trace)
    return result
  } catch (error) {
    const message = 'I couldn’t complete that just now. Please try again in a moment.'
    await recordUser(request, { orchestrator: true, outcome: 'error' })
    const messageId = await recordAgent(message, 'error', { outcome: 'error' })
    trace.recordAgent({ agentId: 'orchestrator', agentRole: 'orchestrator', instanceId: orchestratorInstanceId, status: 'failed', error: error instanceof Error ? error.message : 'orchestrator_error', endedAt: new Date().toISOString() })
    const result = finish('error', null, null, messageId, message)
    scheduleFlush(trace)
    return result
  }
}

function scheduleFlush(trace: TraceCollector): void {
  try { after(() => trace.flush()) } catch { void trace.flush() }
}

export { REFUSAL_BRAIN_UNAVAILABLE, AR_GREETING_REPLY, EN_GREETING_REPLY }