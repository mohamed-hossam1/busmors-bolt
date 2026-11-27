import type { ModelMessage, ToolSet } from 'ai'
import type { AgentRole } from '../../config/ai-models'
import { AGENT_BUDGETS, type AgentBudgets } from '../../config/agent-budgets'
import type { TraceCollector } from '../observability'
import { scheduleCollectorFlush } from '../observability'
import {
  runAgentTurn as defaultRunAgentTurn,
  type AgentTurnOptions,
  type AgentTurnResult,
  type GatewayUsage,
} from '../ai-gateway'
import type { SkillLoadTracker } from './skill-loader'

/**
 * Shared agent runtime.
 *
 * runAgent() is the single entry point every employee agent uses. It drives the
 * model through the shared gateway (tools + multi-step), records agent/model
 * events to the one trace collector, and enforces the shared TaskGuardrailTracker
 * budget (active time, LLM calls, external tool calls, cancellation). It returns
 * an honest structured result: a task that hits a ceiling yields `partial` with a
 * clear stopReason rather than a fabricated completion.
 */

export type AgentRunStatus = 'completed' | 'partial'

export type AgentStopReason =
  | 'finished'
  | 'max_steps'
  | 'budget_llm'
  | 'budget_time'
  | 'cancelled'
  | 'error'

export interface TaskGuardrailSnapshot {
  elapsedActiveMs: number
  llmCalls: number
  externalToolCalls: number
  remainingLlmCalls: number
  remainingExternalToolCalls: number
  cancelled: boolean
  loadedSkills: string[]
  usedTools: string[]
}

/**
 * Tracks the shared, per-task budget across every participating agent. Counters
 * are never reset on retries or continuations of the same run (spec 3.8).
 */
export class TaskGuardrailTracker implements SkillLoadTracker {
  readonly budgets: AgentBudgets
  private readonly startedAt = Date.now()
  private accumulatedActiveMs = 0
  private activeStartedAt: number | null = this.startedAt
  private llmCalls = 0
  private externalToolCalls = 0
  private cancelled = false
  private cancelReason: string | null = null
  private readonly loadedSkills = new Set<string>()
  private readonly usedTools = new Set<string>()

  constructor(budgets: AgentBudgets = AGENT_BUDGETS) {
    this.budgets = budgets
  }

  recordLlmCall(): void {
    this.llmCalls += 1
  }

  canMakeLlmCall(): boolean {
    return !this.cancelled && this.llmCalls < this.budgets.maxLlmCallsPerTask
  }

  recordExternalToolCall(): void {
    this.externalToolCalls += 1
  }

  canCallExternalTool(): boolean {
    return !this.cancelled && this.externalToolCalls < this.budgets.maxExternalToolCallsPerTask
  }

  recordToolUse(toolName: string): void {
    this.usedTools.add(toolName)
  }

  recordSkillLoad(skillId: string): boolean {
    if (this.loadedSkills.has(skillId)) return false
    this.loadedSkills.add(skillId)
    return true
  }

  pause(): void {
    if (this.activeStartedAt !== null) {
      this.accumulatedActiveMs += Date.now() - this.activeStartedAt
      this.activeStartedAt = null
    }
  }

  resume(): void {
    if (this.activeStartedAt === null && !this.cancelled) {
      this.activeStartedAt = Date.now()
    }
  }

  elapsedActiveMs(): number {
    const running = this.activeStartedAt !== null ? Date.now() - this.activeStartedAt : 0
    return this.accumulatedActiveMs + running
  }

  isTimeExceeded(): boolean {
    return this.elapsedActiveMs() >= this.budgets.activeExecutionTimeoutMs
  }

  cancel(reason = 'cancelled'): void {
    this.cancelled = true
    this.cancelReason = reason
    this.pause()
  }

  isCancelled(): boolean {
    return this.cancelled
  }

  get reason(): string | null {
    return this.cancelReason
  }

  listLoadedSkills(): string[] {
    return [...this.loadedSkills]
  }

  listUsedTools(): string[] {
    return [...this.usedTools]
  }

  snapshot(): TaskGuardrailSnapshot {
    return {
      elapsedActiveMs: this.elapsedActiveMs(),
      llmCalls: this.llmCalls,
      externalToolCalls: this.externalToolCalls,
      remainingLlmCalls: Math.max(0, this.budgets.maxLlmCallsPerTask - this.llmCalls),
      remainingExternalToolCalls: Math.max(0, this.budgets.maxExternalToolCallsPerTask - this.externalToolCalls),
      cancelled: this.cancelled,
      loadedSkills: this.listLoadedSkills(),
      usedTools: this.listUsedTools(),
    }
  }
}

export type AgentTurnRunner = (options: AgentTurnOptions) => Promise<AgentTurnResult>

export interface RunAgentOptions {
  role: AgentRole
  systemPrompt: string
  messages?: ModelMessage[]
  /** Shorthand for a single user message when `messages` is omitted. */
  input?: string
  /** Tools already scoped to this role via getToolsForRole(). */
  tools?: ToolSet
  workspaceId: string
  traceContext: { traceId: string; parentEventId?: string | null }
  tracker: TaskGuardrailTracker
  collector?: TraceCollector
  abortSignal?: AbortSignal
  /** Stable id for this agent instance; generated when omitted. */
  instanceId?: string
  maxSteps?: number
  temperature?: number
  /** Injectable for tests; defaults to the shared gateway runner. */
  runTurn?: AgentTurnRunner
  /** Optional label stored on the agent trace event. */
  label?: string
  /** Optional hook indicating a finished tool-only turn still failed/is incomplete. */
  hasIncompleteWork?: () => boolean
  /** Optional predicate checked after each step to stop cleanly (status: completed, stopReason: finished). */
  shouldStop?: () => boolean
}

export interface RunAgentResult {
  status: AgentRunStatus
  output: string
  usage: GatewayUsage
  loadedSkills: string[]
  usedTools: string[]
  stopReason: AgentStopReason
  instanceId: string
}

function buildMessages(options: RunAgentOptions): ModelMessage[] {
  if (options.messages && options.messages.length > 0) return options.messages
  if (options.input && options.input.trim()) {
    return [{ role: 'user', content: options.input } as ModelMessage]
  }
  return []
}

export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const instanceId = options.instanceId ?? crypto.randomUUID()
  const runTurn = options.runTurn ?? defaultRunAgentTurn
  const { tracker, collector } = options
  const startedAt = new Date().toISOString()
  const messages = buildMessages(options)

  const recordAgentStart = (): void => {
    collector?.recordAgent({
      agentId: instanceId,
      agentRole: options.role,
      parentAgentId: options.traceContext.parentEventId ?? null,
      label: options.label ?? options.role,
      status: 'running',
      startedAt,
      instanceId,
      parentEventId: options.traceContext.parentEventId ?? null,
      input: { role: options.role, workspaceId: options.workspaceId, messages },
    })
  }

  const finish = (
    status: AgentRunStatus,
    output: string,
    usage: GatewayUsage,
    stopReason: AgentStopReason,
    errorMessage?: string,
  ): RunAgentResult => {
    const endedAt = new Date().toISOString()
    collector?.recordAgent({
      agentId: instanceId,
      agentRole: options.role,
      parentAgentId: options.traceContext.parentEventId ?? null,
      label: options.label ?? options.role,
      status,
      startedAt,
      endedAt,
      output: { text: output },
      stopReason,
      error: errorMessage ?? null,
      instanceId,
      parentEventId: options.traceContext.parentEventId ?? null,
    })
    collector?.setResult({ status, finalReply: output })
    if (collector) void scheduleCollectorFlush(collector)
    return {
      status,
      output,
      usage,
      loadedSkills: tracker.listLoadedSkills(),
      usedTools: tracker.listUsedTools(),
      stopReason,
      instanceId,
    }
  }

  recordAgentStart()

  if (tracker.isCancelled()) {
    return finish('partial', '', {}, 'cancelled', tracker.reason ?? undefined)
  }
  if (!tracker.canMakeLlmCall()) {
    return finish('partial', '', {}, 'budget_llm')
  }
  if (tracker.isTimeExceeded()) {
    return finish('partial', '', {}, 'budget_time')
  }

  const maxSteps = Math.max(
    1,
    Math.min(options.maxSteps ?? tracker.budgets.maxLlmCallsPerTask, tracker.snapshot().remainingLlmCalls),
  )

  const turnOptions: AgentTurnOptions = {
    role: options.role,
    system: options.systemPrompt,
    messages,
    tools: options.tools,
    maxSteps,
    temperature: options.temperature,
    abortSignal: options.abortSignal,
    shouldStop: () =>
      !tracker.canMakeLlmCall() ||
      tracker.isCancelled() ||
      tracker.isTimeExceeded() ||
      Boolean(options.shouldStop?.()),
    onStepFinish: (step) => {
      tracker.recordLlmCall()
      collector?.recordModel({
        provider: undefined,
        model: undefined,
        operation: 'agent_step',
        usage: {
          inputTokens: step.usage.inputTokens,
          outputTokens: step.usage.outputTokens,
        },
        outputText: step.text || undefined,
        outputToolCalls: step.toolCalls ?? undefined,
        parentEventId: options.traceContext.parentEventId ?? null,
        instanceId,
      })
    },
  }

  let turn: AgentTurnResult
  try {
    turn = await runTurn(turnOptions)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    collector?.recordModel({
      operation: 'agent_turn',
      error: message,
      parentEventId: options.traceContext.parentEventId ?? null,
      instanceId,
    })
    const reason: AgentStopReason = tracker.isCancelled()
      ? 'cancelled'
      : tracker.isTimeExceeded()
        ? 'budget_time'
        : 'error'
    return finish('partial', '', {}, reason, message)
  }

  // Attribute provider/model to the per-step model events recorded above.
  if (collector && turn.steps.length > 0) {
    // (model events were already pushed per step; provider/model are attached to
    // the turn-level event below for a single authoritative record)
    collector.recordModel({
      provider: turn.provider,
      model: turn.model,
      operation: 'agent_turn',
      usage: {
        inputTokens: turn.usage.inputTokens,
        outputTokens: turn.usage.outputTokens,
      },
      durationMs: turn.latencyMs,
      fallbackUsed: turn.fallback.used,
      fallbackReason: turn.fallback.reason ?? null,
      outputText: turn.text || undefined,
      parentEventId: options.traceContext.parentEventId ?? null,
      instanceId,
    })
  }

  const output = turn.text ?? ''
  let stopReason: AgentStopReason = 'finished'
  if (tracker.isCancelled()) stopReason = 'cancelled'
  else if (tracker.isTimeExceeded()) stopReason = 'budget_time'
  else if (turn.finishReason === 'length' || (maxSteps !== undefined && turn.steps.length >= maxSteps)) {
    stopReason = 'max_steps'
  } else if (!tracker.canMakeLlmCall() && turn.finishReason !== 'stop') {
    stopReason = 'budget_llm'
  }

  const usedToolsInTurn =
    tracker.listUsedTools().length > 0 ||
    turn.steps.some((step) => Array.isArray(step.toolCalls) && step.toolCalls.length > 0)
  const hasOutputOrTools =
    output.trim().length > 0 || (usedToolsInTurn && !options.hasIncompleteWork?.())
  const completed = stopReason === 'finished' && hasOutputOrTools
  return finish(completed ? 'completed' : 'partial', output, turn.usage, stopReason)
}