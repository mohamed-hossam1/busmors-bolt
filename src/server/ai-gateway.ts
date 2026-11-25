import { APICallError, generateText, type LanguageModel, type LanguageModelUsage } from 'ai'
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

export const DEFAULT_ATTEMPT_TIMEOUT_MS = 60_000

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