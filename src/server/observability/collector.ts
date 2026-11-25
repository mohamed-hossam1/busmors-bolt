import { MAX_BYTES, MAX_EVENTS, MODEL_TEXT_CAP, estimateBytes } from './config'
import { projectValue, scrubString } from './sanitize'

/**
 * Per-request execution trace collector.
 *
 * record*() is synchronous and bounded: it projects an allow-listed, capped
 * value into a fresh object, updates a byte counter, and drops the newest event
 * when the buffer is full. It performs no I/O, no await and no JSON.stringify —
 * all of that happens only in flush(), which runs off the response path.
 *
 * This is the single execution-observability logger for the whole employee
 * runtime (agent invocations, skill loads, model calls, tool calls). Nothing else
 * should write to admin_traces/admin_trace_events; new event kinds extend this
 * collector rather than introducing a competing logger.
 */

export interface TraceIdentity {
  traceId: string
  workspaceId?: string | null
  userId?: string | null
  conversationId?: string | null
  messageId?: string | null
  idempotencyKey?: string | null
  request?: string
  route?: string | null
  origin?: unknown
}

export interface ModelRecord {
  provider?: string | null
  model?: string | null
  operation: string
  attempt?: number
  runId?: string | null
  callId?: string | null
  usage?: {
    inputTokens?: number
    outputTokens?: number
    cachedTokens?: number
    reasoningTokens?: number
  } | null
  durationMs?: number
  startedAt?: string
  endedAt?: string
  fallbackUsed?: boolean
  fallbackReason?: string | null
  retryAttempt?: number
  error?: string | null
  input?: { systemPrompt?: string; userPrompt?: string; messages?: unknown } | null
  outputText?: string | null
  outputToolCalls?: unknown
  parentEventId?: string | null
  instanceId?: string | null
}

export interface ToolRecord {
  toolName: string
  agentId?: string
  agentRole?: string
  provider?: string | null
  operation?: string | null
  callId?: string | null
  status?: string | null
  startedAt?: string
  endedAt?: string
  durationMs?: number
  input?: unknown
  output?: unknown
  outputOriginalBytes?: number
  error?: string | null
  parentEventId?: string | null
  runId?: string | null
  attempt?: number
  instanceId?: string | null
}

export interface AgentRecord {
  agentId: string
  agentRole?: string | null
  parentAgentId?: string | null
  label?: string | null
  status?: string | null
  startedAt?: string
  endedAt?: string
  durationMs?: number
  error?: string | null
  input?: unknown
  output?: unknown
  stopReason?: string | null
  parentEventId?: string | null
  runId?: string | null
  attempt?: number
  instanceId?: string | null
}

export interface SkillRecord {
  skillId: string
  agentRole?: string | null
  version?: string | null
  hash?: string | null
  outcome: 'loaded' | 'duplicate' | 'rejected' | 'error'
  durationMs?: number
  error?: string | null
  parentEventId?: string | null
  runId?: string | null
  instanceId?: string | null
}

export interface AdminTraceRow {
  id: string
  workspace_id?: string | null
  user_id?: string | null
  conversation_id?: string | null
  message_id?: string | null
  idempotency_key?: string | null
  request: string
  status: string
  route?: string | null
  final_reply?: string | null
  started_at?: string | null
  completed_at?: string | null
  duration_ms?: number | null
  metadata: Record<string, unknown>
}

export interface AdminTraceEvent {
  id: string
  trace_id: string
  parent_event_id?: string | null
  event_type: string
  seq: number
  agent_id?: string | null
  agent_role?: string | null
  parent_agent_id?: string | null
  run_id?: string | null
  attempt?: number | null
  instance_id?: string | null
  correlation_id?: string | null
  tool_name?: string | null
  operation?: string | null
  provider?: string | null
  model?: string | null
  call_id?: string | null
  status?: string | null
  started_at?: string | null
  ended_at?: string | null
  duration_ms?: number | null
  input_payload?: unknown
  output_preview?: unknown
  output_truncated: boolean
  output_original_bytes?: number | null
  llm_input_tokens: number
  llm_output_tokens: number
  llm_total_tokens: number
  cached_tokens: number
  reasoning_tokens: number
  retry_attempt?: number | null
  fallback_used: boolean
  error?: string | null
  metadata: Record<string, unknown>
}

export type TraceSink = (trace: AdminTraceRow, events: AdminTraceEvent[]) => Promise<void>

export function observabilityEnabled(): boolean {
  return process.env.OBSERVABILITY_ENABLED !== 'false'
}

async function defaultSink(trace: AdminTraceRow, events: AdminTraceEvent[]): Promise<void> {
  // Lazy import so importing the collector never pulls server-only credentials
  // into non-request contexts (tests, scripts); the guard still applies on use.
  const { createAdminClient } = await import('../supabase-admin')
  const admin = createAdminClient()
  const { error } = await admin.rpc('record_admin_trace', {
    p_trace: trace,
    p_events: events,
  })
  if (error) throw error
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuidOrNull(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function duration(start?: string, end?: string): number | undefined {
  if (!start || !end) return undefined
  const ms = Date.parse(end) - Date.parse(start)
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

export class TraceCollector {
  readonly traceId: string
  private identity: TraceIdentity
  private sink: TraceSink
  private enabled: boolean

  private runId: string | null = null
  private attempt = 0
  private seq = 0
  private bytes = 0
  private droppedCount = 0
  private truncated = false
  private startedAt: string
  private final: {
    status?: string
    route?: string | null
    finalReply?: string | null
    completedAt?: string
    durationMs?: number
    metadata?: Record<string, unknown>
  } = {}

  private events: AdminTraceEvent[] = []

  constructor(identity: TraceIdentity, options: { sink?: TraceSink; enabled?: boolean } = {}) {
    this.traceId = identity.traceId
    this.identity = { ...identity }
    this.sink = options.sink ?? defaultSink
    this.enabled = (options.enabled ?? observabilityEnabled()) && process.env.OBSERVABILITY_ENABLED !== 'false'
    this.startedAt = new Date().toISOString()
  }

  /** Bind the collector to a specific task run/attempt (dispatcher/resume path). */
  setRun(runId: string | null | undefined, attempt: number): void {
    this.runId = uuidOrNull(runId)
    this.attempt = Math.max(0, Math.trunc(attempt))
  }

  setContext(patch: Partial<TraceIdentity>): void {
    this.identity = { ...this.identity, ...patch }
  }

  /** Record final trace status/route/reply; safe to call once at the end. */
  setResult(result: {
    status?: string
    route?: string | null
    finalReply?: string | null
    completedAt?: string
    durationMs?: number
    metadata?: Record<string, unknown>
  }): void {
    this.final = { ...this.final, ...result }
  }

  get size(): number {
    return this.events.length
  }

  get dropped(): number {
    return this.droppedCount
  }

  get bufferedBytes(): number {
    return this.bytes
  }

  recordModel(record: ModelRecord): void {
    if (!this.enabled) return
    const inputTokens = Math.max(0, num(record.usage?.inputTokens))
    const outputTokens = Math.max(0, num(record.usage?.outputTokens))
    const input = record.input
      ? {
          operation: record.operation,
          systemHead: record.input.systemPrompt ? scrubString(record.input.systemPrompt, MODEL_TEXT_CAP) : null,
          userHead: record.input.userPrompt ? scrubString(record.input.userPrompt, MODEL_TEXT_CAP) : null,
          messages: record.input.messages ? projectValue(record.input.messages) : null,
        }
      : { operation: record.operation }
    const output = record.outputText
      ? { textHead: scrubString(record.outputText, MODEL_TEXT_CAP) }
      : record.outputToolCalls
        ? { toolCalls: projectValue(record.outputToolCalls) }
        : null
    this.push({
      id: crypto.randomUUID(),
      trace_id: this.traceId,
      parent_event_id: uuidOrNull(record.parentEventId),
      event_type: 'model',
      seq: this.seq,
      agent_id: 'model',
      agent_role: 'model',
      run_id: record.runId ?? this.runId,
      attempt: record.attempt ?? this.attempt,
      instance_id: uuidOrNull(record.instanceId),
      call_id: uuidOrNull(record.callId),
      operation: record.operation,
      provider: record.provider ?? null,
      model: record.model ?? null,
      status: record.error ? 'failed' : 'completed',
      started_at: record.startedAt ?? null,
      ended_at: record.endedAt ?? null,
      duration_ms: record.durationMs ?? duration(record.startedAt, record.endedAt) ?? null,
      input_payload: input,
      output_preview: output,
      output_truncated: false,
      output_original_bytes: null,
      llm_input_tokens: inputTokens,
      llm_output_tokens: outputTokens,
      llm_total_tokens: inputTokens + outputTokens,
      cached_tokens: Math.max(0, num(record.usage?.cachedTokens)),
      reasoning_tokens: Math.max(0, num(record.usage?.reasoningTokens)),
      retry_attempt: record.retryAttempt ?? null,
      fallback_used: Boolean(record.fallbackUsed),
      error: record.error ?? null,
      metadata: record.fallbackReason ? { fallbackReason: record.fallbackReason } : {},
    })
  }

  recordTool(record: ToolRecord): void {
    if (!this.enabled) return
    const outputBytes = estimateBytes(record.output)
    this.push({
      id: crypto.randomUUID(),
      trace_id: this.traceId,
      parent_event_id: uuidOrNull(record.parentEventId),
      event_type: 'tool',
      seq: this.seq,
      agent_id: record.toolName,
      agent_role: record.agentRole ?? 'tool',
      run_id: record.runId ?? this.runId,
      attempt: record.attempt ?? this.attempt,
      instance_id: uuidOrNull(record.instanceId),
      correlation_id: null,
      tool_name: record.toolName,
      operation: record.operation ?? null,
      provider: record.provider ?? null,
      call_id: uuidOrNull(record.callId),
      status: record.status ?? null,
      started_at: record.startedAt ?? null,
      ended_at: record.endedAt ?? null,
      duration_ms: record.durationMs ?? duration(record.startedAt, record.endedAt) ?? null,
      input_payload: record.input ? projectValue(record.input) : null,
      output_preview: record.output ? projectValue(record.output) : null,
      output_truncated: outputBytes > 0,
      output_original_bytes: record.outputOriginalBytes ?? (outputBytes || null),
      llm_input_tokens: 0,
      llm_output_tokens: 0,
      llm_total_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      retry_attempt: null,
      fallback_used: false,
      error: record.error ?? null,
      metadata: {},
    })
  }

  recordAgent(record: AgentRecord): void {
    if (!this.enabled) return
    this.push({
      id: crypto.randomUUID(),
      trace_id: this.traceId,
      parent_event_id: uuidOrNull(record.parentEventId),
      event_type: 'agent',
      seq: this.seq,
      agent_id: record.agentId,
      agent_role: record.agentRole ?? null,
      parent_agent_id: record.parentAgentId ?? null,
      run_id: record.runId ?? this.runId,
      attempt: record.attempt ?? this.attempt,
      instance_id: uuidOrNull(record.instanceId),
      status: record.status ?? null,
      started_at: record.startedAt ?? null,
      ended_at: record.endedAt ?? null,
      duration_ms: record.durationMs ?? duration(record.startedAt, record.endedAt) ?? null,
      input_payload: record.input ? projectValue(record.input) : null,
      output_preview: record.output ? projectValue(record.output) : null,
      output_truncated: false,
      llm_input_tokens: 0,
      llm_output_tokens: 0,
      llm_total_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      fallback_used: false,
      error: record.error ?? null,
      metadata: {
        ...(record.label ? { label: record.label } : {}),
        ...(record.stopReason ? { stopReason: record.stopReason } : {}),
      },
    })
  }

  recordSkill(record: SkillRecord): void {
    if (!this.enabled) return
    this.push({
      id: crypto.randomUUID(),
      trace_id: this.traceId,
      parent_event_id: uuidOrNull(record.parentEventId),
      event_type: 'skill',
      seq: this.seq,
      agent_id: record.skillId,
      agent_role: record.agentRole ?? 'skill',
      run_id: record.runId ?? this.runId,
      attempt: this.attempt,
      instance_id: uuidOrNull(record.instanceId),
      tool_name: null,
      operation: 'read_skill',
      status: record.outcome,
      started_at: null,
      ended_at: null,
      duration_ms: record.durationMs ?? null,
      input_payload: { skillId: record.skillId, agentRole: record.agentRole ?? null },
      output_preview: { version: record.version ?? null, hash: record.hash ?? null, outcome: record.outcome },
      output_truncated: false,
      llm_input_tokens: 0,
      llm_output_tokens: 0,
      llm_total_tokens: 0,
      cached_tokens: 0,
      reasoning_tokens: 0,
      fallback_used: false,
      error: record.error ?? null,
      metadata: {},
    })
  }

  private push(event: AdminTraceEvent): void {
    if (!this.enabled) return
    const bytes = estimateBytes(event)
    if (this.events.length >= MAX_EVENTS || this.bytes + bytes > MAX_BYTES) {
      this.droppedCount += 1
      this.truncated = true
      return
    }
    this.bytes += bytes
    this.events.push(event)
    this.seq += 1
  }

  private buildTrace(): AdminTraceRow {
    const completedAt = this.final.completedAt ?? new Date().toISOString()
    return {
      id: this.traceId,
      workspace_id: this.identity.workspaceId ?? null,
      user_id: this.identity.userId ?? null,
      conversation_id: this.identity.conversationId ?? null,
      message_id: this.identity.messageId ?? null,
      idempotency_key: this.identity.idempotencyKey ?? null,
      request: this.identity.request ?? '',
      status: this.final.status ?? 'completed',
      route: this.final.route ?? this.identity.route ?? null,
      final_reply: this.final.finalReply ?? null,
      started_at: this.startedAt,
      completed_at: completedAt,
      duration_ms: this.final.durationMs ?? (Date.parse(completedAt) - Date.parse(this.startedAt)),
      metadata: {
        ...(this.identity.origin ? { origin: this.identity.origin } : {}),
        ...(this.final.metadata ?? {}),
        droppedCount: this.droppedCount,
        truncated: this.truncated,
      },
    }
  }

  /** Serialize the buffer and flush it. The only place I/O happens. */
  async flush(): Promise<void> {
    if (!this.enabled) return
    if (this.events.length === 0) return
    const trace = this.buildTrace()
    const events = this.events
    try {
      await this.sink(trace, events)
    } catch (error) {
      // Observability is best-effort: a logging failure must never fail the request.
      console.error('[observability] flush failed:', error instanceof Error ? error.message : error)
    }
  }
}

export function createTraceCollector(
  identity: TraceIdentity,
  options: { sink?: TraceSink; enabled?: boolean } = {},
): TraceCollector {
  return new TraceCollector(identity, options)
}

/**
 * Flush a collector off the response path. Uses Next.js `after()` when running
 * inside a request so persistence never adds user-facing latency; otherwise falls
 * back to a caught fire-and-forget so a logging failure can never crash the run.
 */
export async function scheduleCollectorFlush(collector: TraceCollector): Promise<void> {
  try {
    const { after } = await import('next/server')
    after(() => collector.flush())
    return
  } catch {
    // Not inside a Next request scope (e.g. tests, scripts): fire-and-forget.
  }
  void collector.flush()
}