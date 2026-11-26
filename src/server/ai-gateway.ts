import {
  APICallError,
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
  type ToolSet,
} from 'ai'
import {
  assertModelAllowed,
  assertProviderCredentials,
  getLanguageModel,
  getRoleModelChain,
  type AgentRole,
  type ResolvedModelTarget,
} from '../config/ai-models'

export type FallbackReason =
  | 'rate_limit'
  | 'timeout'
  | 'provider_5xx'
  | 'network'
  | 'technical'
  | 'validation'
  | 'security'
  | 'non_technical'

export interface GatewayUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  raw?: unknown
}

export interface ModelAttempt {
  attemptIndex: number
  provider: string
  model: string
  ok: boolean
  latencyMs: number
  error?: {
    name: string
    message: string
    statusCode?: number
    reason: FallbackReason
  }
}

export interface FallbackMetadata {
  used: boolean
  from?: Pick<ResolvedModelTarget, 'provider' | 'model'>
  to?: Pick<ResolvedModelTarget, 'provider' | 'model'>
  reason?: FallbackReason
  attempts: ModelAttempt[]
}

export interface GenerateWithRoleResult {
  text: string
  provider: string
  model: string
  usage: GatewayUsage
  latencyMs: number
  totalLatencyMs: number
  attemptIndex: number
  fallback: FallbackMetadata
  finishReason?: string
  warnings?: unknown[]
}

export interface GenerateWithRoleOptions {
  role: AgentRole
  system: string
  prompt: string
  temperature?: number
  signal?: AbortSignal
  timeoutMs?: number
  validate?: (text: string) => boolean
}

interface GenerateTextCallOptions {
  model: LanguageModel
  system?: string
  prompt: string
  temperature?: number
  maxRetries: number
  abortSignal?: AbortSignal
  timeout?: number
}

interface GenerateTextLikeResult {
  text: string
  usage?: Partial<LanguageModelUsage> | null
  finishReason?: string
  warnings?: unknown[]
}

type GenerateTextLike = (options: GenerateTextCallOptions) => Promise<GenerateTextLikeResult>

export interface ModelGatewayDeps {
  generateText?: GenerateTextLike
}

export const DEFAULT_ATTEMPT_TIMEOUT_MS = 300_000
// AI SDK `stepMs` spans both the model call and tool execution inside that step
// (including delegated sub-agents like research/content/director), so keep it large.
export const DEFAULT_STEP_TIMEOUT_MS = 600_000
export const DEFAULT_AGENT_TURN_TIMEOUT_MS = 300_000
export const DEFAULT_ORCHESTRATION_TURN_TIMEOUT_MS = 600_000

/**
 * Best-effort deterministic repair for slightly malformed JSON emitted in LLM
 * tool calls (markdown fences, raw newlines/tabs inside string literals, or
 * trailing commas). Returns null when the input cannot be parsed cleanly.
 */
export function repairMalformedToolCallJson(raw: string): string | null {
  if (typeof raw !== 'string') return null
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim()
  if (!stripped) return null

  const tryParse = (candidate: string): string | null => {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      return null
    }
  }

  const direct = tryParse(stripped)
  if (direct) return direct

  // Escape unescaped control characters inside JSON string literals and strip
  // trailing commas before `}` or `]`.
  let escaped = ''
  let inString = false
  let prevEscape = false
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (prevEscape) {
      escaped += ch
      prevEscape = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped += ch
      prevEscape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      escaped += ch
      continue
    }
    if (inString) {
      if (ch === '\n') {
        escaped += '\\n'
        continue
      }
      if (ch === '\r') {
        escaped += '\\r'
        continue
      }
      if (ch === '\t') {
        escaped += '\\t'
        continue
      }
    }
    escaped += ch
  }

  const noTrailingCommas = escaped.replace(/,\s*([}\]])/g, '$1')
  return tryParse(noTrailingCommas)
}

function isProviderToolJsonError(error: unknown): boolean {
  const record = asRecord(error)
  const name = typeof record?.name === 'string' ? record.name : ''
  const message = typeof record?.message === 'string' ? record.message : ''
  return (
    name === 'AI_JSONParseError' ||
    name === 'AI_InvalidToolInputError' ||
    name === 'JSONParseError' ||
    /Failed to parse tool call arguments as JSON/i.test(message)
  )
}

export class GatewayValidationError extends Error {
  constructor(message = 'The generated text did not pass validation.') {
    super(message)
    this.name = 'GatewayValidationError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

export function getErrorStatusCode(error: unknown): number | undefined {
  const record = asRecord(error)
  const cause = asRecord(record?.cause)
  const response = asRecord(record?.response)
  const candidate = record?.statusCode ?? record?.status ?? cause?.statusCode ?? response?.status
  return typeof candidate === 'number' ? candidate : undefined
}

export function isTimeoutError(error: unknown): boolean {
  const record = asRecord(error)
  const cause = asRecord(record?.cause)
  const name = typeof record?.name === 'string' ? record.name : ''
  const message = typeof record?.message === 'string' ? record.message : ''
  const code = typeof cause?.code === 'string' ? cause.code : ''
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    code === 'ETIMEDOUT' ||
    /timed?\s*out|timeout/i.test(message)
  )
}

export function isNetworkError(error: unknown): boolean {
  const record = asRecord(error)
  const cause = asRecord(record?.cause)
  const code = typeof cause?.code === 'string' ? cause.code : ''
  return ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', 'ETIMEDOUT'].includes(code)
}

export function classifyFailure(error: unknown): FallbackReason {
  if (error instanceof GatewayValidationError) return 'validation'

  const statusCode = getErrorStatusCode(error)
  if (statusCode === 401 || statusCode === 403) return 'security'
  if (statusCode === 429) return 'rate_limit'
  if (statusCode !== undefined && statusCode >= 500 && statusCode <= 599) return 'provider_5xx'
  if (statusCode === 408) return 'timeout'
  if (isTimeoutError(error)) return 'timeout'
  if (isNetworkError(error)) return 'network'

  if (APICallError.isInstance(error)) {
    return error.isRetryable ? 'technical' : 'non_technical'
  }

  return 'non_technical'
}

export function isEligibleTechnicalFailure(error: unknown): boolean {
  const reason = classifyFailure(error)
  return (
    reason === 'rate_limit' ||
    reason === 'timeout' ||
    reason === 'provider_5xx' ||
    reason === 'network' ||
    reason === 'technical'
  )
}

function normalizeUsage(usage: GenerateTextLikeResult['usage']): GatewayUsage {
  if (!usage) return {}
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    raw: usage.raw,
  }
}

function errorMessage(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message }
  return { name: 'Error', message: String(error) }
}

export function createModelGateway(deps: ModelGatewayDeps = {}) {
  const generate = deps.generateText ?? (generateText as unknown as GenerateTextLike)

  return async function generateWithRole(options: GenerateWithRoleOptions): Promise<GenerateWithRoleResult> {
    const chain = getRoleModelChain(options.role)
    if (chain.length === 0) {
      throw new Error(`No active model targets configured for role ${options.role}.`)
    }

    const attempts: ModelAttempt[] = []
    const startedAt = Date.now()
    let lastError: unknown

    for (let attemptIndex = 0; attemptIndex < chain.length; attemptIndex++) {
      if (options.signal?.aborted) {
        throw new DOMException('The request was aborted.', 'AbortError')
      }

      const target = chain[attemptIndex]
      assertModelAllowed(target.provider, target.model)
      assertProviderCredentials(target.provider)

      const attemptStartedAt = Date.now()
      try {
        const result = await generate({
          model: getLanguageModel(target),
          system: options.system,
          prompt: options.prompt,
          temperature: options.temperature ?? target.temperature,
          maxRetries: 0,
          abortSignal: options.signal,
          timeout: options.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS,
        })

        if (options.validate && !options.validate(result.text)) {
          throw new GatewayValidationError()
        }

        const latencyMs = Date.now() - attemptStartedAt
        attempts.push({
          attemptIndex,
          provider: target.provider,
          model: target.model,
          ok: true,
          latencyMs,
        })

        const firstFailure = attempts.find((attempt) => !attempt.ok)?.error
        return {
          text: result.text,
          provider: target.provider,
          model: target.model,
          usage: normalizeUsage(result.usage),
          latencyMs,
          totalLatencyMs: Date.now() - startedAt,
          attemptIndex,
          fallback: {
            used: attemptIndex > 0,
            from: attemptIndex > 0 ? { provider: chain[0].provider, model: chain[0].model } : undefined,
            to: { provider: target.provider, model: target.model },
            reason: firstFailure?.reason,
            attempts,
          },
          finishReason: result.finishReason,
          warnings: result.warnings,
        }
      } catch (error) {
        lastError = error
        const latencyMs = Date.now() - attemptStartedAt
        const reason = classifyFailure(error)
        const details = errorMessage(error)
        attempts.push({
          attemptIndex,
          provider: target.provider,
          model: target.model,
          ok: false,
          latencyMs,
          error: {
            ...details,
            statusCode: getErrorStatusCode(error),
            reason,
          },
        })

        if (options.signal?.aborted || !isEligibleTechnicalFailure(error)) {
          throw error
        }
      }
    }

    throw lastError ?? new Error('All configured model targets failed.')
  }
}

export const generateWithRole = createModelGateway()

/**
 * Multi-step, tool-enabled agent turn.
 *
 * Unlike generateWithRole (single prompt/response), this drives the model through
 * a tool loop: the model may call tools, receive results, and continue for up to
 * maxSteps steps or until shouldStop() returns true (used by the runtime to honor
 * the shared LLM-call budget). It keeps the same bounded, role-based fallback as
 * the single-shot gateway and reports per-step usage, text, and tool calls.
 */

export interface AgentTurnStep {
  index: number
  text: string
  toolCalls: unknown
  toolResults: unknown
  usage: GatewayUsage
  finishReason?: string
}

export interface AgentTurnResult {
  text: string
  provider: string
  model: string
  usage: GatewayUsage
  steps: AgentTurnStep[]
  finishReason?: string
  latencyMs: number
  totalLatencyMs: number
  fallback: FallbackMetadata
  warnings?: unknown[]
}

export interface AgentTurnOptions {
  role: AgentRole
  system: string
  messages?: ModelMessage[]
  prompt?: string
  tools?: ToolSet
  maxSteps?: number
  temperature?: number
  abortSignal?: AbortSignal
  timeoutMs?: number | { totalMs?: number; stepMs?: number; chunkMs?: number }
  /** Return true to stop starting new steps (e.g. shared budget reached). */
  shouldStop?: (completedSteps: number) => boolean
  onStepFinish?: (step: AgentTurnStep) => void
}

interface AgentGenerateCallOptions {
  model: LanguageModel
  system?: string
  messages?: ModelMessage[]
  prompt?: string
  tools?: ToolSet
  temperature?: number
  maxRetries: number
  abortSignal?: AbortSignal
  timeout?: number | { totalMs?: number; stepMs?: number; chunkMs?: number }
  stopWhen?: (result: { steps: unknown[] }) => boolean
  onStepFinish?: (step: unknown) => void
  experimental_repairToolCall?: (options: {
    toolCall: { toolCallId: string; toolName: string; input: string }
  }) => Promise<{ toolCallId: string; toolName: string; input: string } | null>
}

interface AgentGenerateResult {
  text: string
  usage?: Partial<LanguageModelUsage> | null
  finishReason?: string
  steps?: unknown[]
  warnings?: unknown[]
}

type AgentGenerateLike = (options: AgentGenerateCallOptions) => Promise<AgentGenerateResult>

export interface AgentGatewayDeps {
  generateText?: AgentGenerateLike
}

function normalizeStep(step: unknown, index: number): AgentTurnStep {
  const record = (step && typeof step === 'object' ? step : {}) as Record<string, unknown>
  return {
    index,
    text: typeof record.text === 'string' ? record.text : '',
    toolCalls: record.toolCalls ?? record.toolCalls ?? null,
    toolResults: record.toolResults ?? null,
    usage: normalizeUsage(record.usage as GenerateTextLikeResult['usage']),
    finishReason: typeof record.finishReason === 'string' ? record.finishReason : undefined,
  }
}

export function createAgentTurnRunner(deps: AgentGatewayDeps = {}) {
  const generate = deps.generateText ?? (generateText as unknown as AgentGenerateLike)

  return async function runAgentTurn(options: AgentTurnOptions): Promise<AgentTurnResult> {
    const chain = getRoleModelChain(options.role)
    if (chain.length === 0) {
      throw new Error(`No active model targets configured for role ${options.role}.`)
    }
    const maxSteps = options.maxSteps && options.maxSteps > 0 ? Math.trunc(options.maxSteps) : undefined

    const attempts: ModelAttempt[] = []
    const startedAt = Date.now()
    let lastError: unknown

    for (let attemptIndex = 0; attemptIndex < chain.length; attemptIndex++) {
      if (options.abortSignal?.aborted) {
        throw new DOMException('The request was aborted.', 'AbortError')
      }

      const target = chain[attemptIndex]
      assertModelAllowed(target.provider, target.model)
      assertProviderCredentials(target.provider)

      const attemptStartedAt = Date.now()
      let stepIndex = 0
      const steps: AgentTurnStep[] = []
      const stopWhen = (result: { steps: unknown[] }): boolean => {
        const completed = Array.isArray(result?.steps) ? result.steps.length : 0
        if (maxSteps !== undefined && completed >= maxSteps) return true
        if (options.shouldStop?.(completed)) return true
        return false
      }
      const onStepFinish = (rawStep: unknown): void => {
        const step = normalizeStep(rawStep, stepIndex++)
        steps.push(step)
        options.onStepFinish?.(step)
      }

      const defaultTimeout = {
        stepMs: DEFAULT_STEP_TIMEOUT_MS,
        totalMs:
          options.role === 'director' || options.role === 'orchestrator'
            ? DEFAULT_ORCHESTRATION_TURN_TIMEOUT_MS
            : DEFAULT_AGENT_TURN_TIMEOUT_MS,
      }

      try {
        const result = await generate({
          model: getLanguageModel(target),
          system: options.system,
          messages: options.messages,
          prompt: options.prompt,
          tools: options.tools,
          temperature: options.temperature ?? target.temperature,
          maxRetries: 0,
          abortSignal: options.abortSignal,
          timeout: options.timeoutMs ?? defaultTimeout,
          stopWhen,
          onStepFinish,
          experimental_repairToolCall: async ({ toolCall }) => {
            const repaired = repairMalformedToolCallJson(toolCall.input)
            if (!repaired || repaired === toolCall.input) return null
            return { ...toolCall, input: repaired }
          },
        })

        const latencyMs = Date.now() - attemptStartedAt
        attempts.push({ attemptIndex, provider: target.provider, model: target.model, ok: true, latencyMs })

        const firstFailure = attempts.find((attempt) => !attempt.ok)?.error
        return {
          text: result.text,
          provider: target.provider,
          model: target.model,
          usage: normalizeUsage(result.usage),
          steps,
          finishReason: result.finishReason,
          latencyMs,
          totalLatencyMs: Date.now() - startedAt,
          fallback: {
            used: attemptIndex > 0,
            from: attemptIndex > 0 ? { provider: chain[0].provider, model: chain[0].model } : undefined,
            to: { provider: target.provider, model: target.model },
            reason: firstFailure?.reason,
            attempts,
          },
          warnings: result.warnings,
        }
      } catch (error) {
        lastError = error
        const latencyMs = Date.now() - attemptStartedAt
        const reason = classifyFailure(error)
        const details = errorMessage(error)
        attempts.push({
          attemptIndex,
          provider: target.provider,
          model: target.model,
          ok: false,
          latencyMs,
          error: { ...details, statusCode: getErrorStatusCode(error), reason },
        })

        // Never restart a multi-step agent loop from step 0 after a timeout or
        // multiple completed steps (that burns minutes & duplicates tool loops).
        const allowMidRunFallback = steps.length === 0 || (reason !== 'timeout' && steps.length <= 1)
        const canFallback =
          allowMidRunFallback &&
          (isEligibleTechnicalFailure(error) || isProviderToolJsonError(error))
        if (options.abortSignal?.aborted || !canFallback) {
          throw error
        }
      }
    }

    throw lastError ?? new Error('All configured model targets failed.')
  }
}

export const runAgentTurn = createAgentTurnRunner()