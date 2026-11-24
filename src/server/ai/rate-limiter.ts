import 'server-only'
import { isProviderModelAllowed, type ModelConfig } from '../../config/ai-models'

/**
 * Shared provider rate-limit & preflight context helper (spec §2.6, §2.7, §6.7).
 *
 * Enforces:
 *  - global test-mode allowlist before network dispatch
 *  - non-double-counted serialized request token estimation vs inputCap
 *  - shared per-provider 429 cooldowns & actual rate-limit header tracking
 */

interface ProviderRateState {
  cooldownUntil: number
  unavailableUntil: number
  /** Remaining tokens reported by provider rate-limit headers, when present. */
  reportedRemainingTokens: number | null
  reportedResetAt: number
}

const providerStates = new Map<string, ProviderRateState>()

function stateFor(provider: string): ProviderRateState {
  let state = providerStates.get(provider)
  if (!state) {
    state = { cooldownUntil: 0, unavailableUntil: 0, reportedRemainingTokens: null, reportedResetAt: 0 }
    providerStates.set(provider, state)
  }
  return state
}

/**
 * Estimate serialized request tokens conservatively without double-counting
 * systemPrompt or userPrompt when they are already present in messages.
 */
export function estimateSerializedTokens(input: {
  systemPrompt?: string
  messages?: { role: string; content: string | null }[]
  tools?: unknown[]
  userPrompt?: string
}): number {
  const hasMessages = Array.isArray(input.messages) && input.messages.length > 0
  const hasSystemInMessages = hasMessages && input.messages!.some((m) => m.role === 'system')
  const parts: string[] = []
  if (input.systemPrompt && !hasSystemInMessages) parts.push(input.systemPrompt)
  if (input.userPrompt && !hasMessages) parts.push(input.userPrompt)
  if (hasMessages) parts.push(JSON.stringify(input.messages))
  if (input.tools && input.tools.length > 0) parts.push(JSON.stringify(input.tools))

  let totalBytes = 0
  for (const p of parts) {
    totalBytes += Buffer.byteLength(p, 'utf8')
  }
  // OpenAI/Groq JSON + mixed text estimate (~4 bytes/token) + framing overhead
  return Math.ceil(totalBytes / 4) + 64
}

export interface PreflightResult {
  allowed: boolean
  reason?: 'disallowed_in_mode' | 'rate_limit_cooldown' | 'tpm_limit' | 'input_cap_exceeded'
  detail?: string
  estimatedInputTokens: number
  /** Milliseconds until provider quota resets when blocked by cooldown/TPM. */
  waitMs?: number
}

export function checkProviderPreflight(params: {
  provider: string
  model: string
  estimatedInputTokens: number
  inputCap?: number
  completionCap?: number
  now?: number
}): PreflightResult {
  const now = params.now ?? Date.now()
  if (!isProviderModelAllowed(params.provider as ModelConfig['provider'], params.model)) {
    return {
      allowed: false,
      reason: 'disallowed_in_mode',
      detail: `${params.provider}/${params.model} is not permitted in current AI_MODE`,
      estimatedInputTokens: params.estimatedInputTokens,
    }
  }

  if (params.inputCap && params.estimatedInputTokens > params.inputCap) {
    return {
      allowed: false,
      reason: 'input_cap_exceeded',
      detail: `Serialized request (~${params.estimatedInputTokens} tokens) exceeds ${params.provider} inputCap (${params.inputCap})`,
      estimatedInputTokens: params.estimatedInputTokens,
    }
  }

  const state = stateFor(params.provider)
  if (state.cooldownUntil > now) {
    const waitMs = state.cooldownUntil - now
    const waitSec = Math.ceil(waitMs / 1000)
    return {
      allowed: false,
      reason: 'rate_limit_cooldown',
      detail: `${params.provider} in 429 cooldown for ${waitSec}s`,
      estimatedInputTokens: params.estimatedInputTokens,
      waitMs,
    }
  }
  if (state.unavailableUntil > now) {
    const waitMs = state.unavailableUntil - now
    const waitSec = Math.ceil(waitMs / 1000)
    return {
      allowed: false,
      reason: 'rate_limit_cooldown',
      detail: `${params.provider} temporarily skipped after timeout/5xx (${waitSec}s remaining)`,
      estimatedInputTokens: params.estimatedInputTokens,
      waitMs,
    }
  }

  // Respect provider-reported remaining tokens before reset if explicitly low.
  if (state.reportedRemainingTokens !== null && state.reportedResetAt > now) {
    if (state.reportedRemainingTokens < params.estimatedInputTokens) {
      return {
        allowed: false,
        reason: 'tpm_limit',
        detail: `${params.provider} remaining token quota (${state.reportedRemainingTokens}) below request estimate (~${params.estimatedInputTokens})`,
        estimatedInputTokens: params.estimatedInputTokens,
        waitMs: state.reportedResetAt - now,
      }
    }
  }

  return { allowed: true, estimatedInputTokens: params.estimatedInputTokens }
}

/** Parse Retry-After or reset duration header into milliseconds. */
function parseDurationMs(raw: string | null): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const sec = Number(trimmed)
  if (Number.isFinite(sec) && sec > 0) return Math.min(60_000, Math.ceil(sec * 1000))
  const msMatch = /^(\d+(?:\.\d+)?)ms$/i.exec(trimmed)
  if (msMatch) return Math.min(60_000, Math.ceil(Number(msMatch[1])))
  const sMatch = /^(\d+(?:\.\d+)?)s$/i.exec(trimmed)
  if (sMatch) return Math.min(60_000, Math.ceil(Number(sMatch[1]) * 1000))
  const mMatch = /^(\d+(?:\.\d+)?)m(\d+(?:\.\d+)?)s$/i.exec(trimmed)
  if (mMatch) return Math.min(60_000, Math.ceil((Number(mMatch[1]) * 60 + Number(mMatch[2])) * 1000))
  return null
}

export function recordProviderOutcome(params: {
  provider: string
  status: number
  headers?: Headers
  actualTokens?: number | null
  now?: number
}): void {
  const now = params.now ?? Date.now()
  const state = stateFor(params.provider)
  if (params.status === 429) {
    const cooldownMs =
      (params.headers ? (parseDurationMs(params.headers.get('retry-after')) ?? parseDurationMs(params.headers.get('x-ratelimit-reset-tokens')) ?? parseDurationMs(params.headers.get('x-ratelimit-reset-requests'))) : null) ??
      15_000
    state.cooldownUntil = Math.max(state.cooldownUntil, now + cooldownMs)
    return
  }
  if (params.status >= 500 || params.status === 504) {
    state.unavailableUntil = Math.max(state.unavailableUntil, now + 30_000)
    return
  }
  if (params.status >= 200 && params.status < 300 && params.headers) {
    const remRaw = params.headers.get('x-ratelimit-remaining-tokens')
    if (remRaw !== null) {
      const rem = Number(remRaw)
      if (Number.isFinite(rem)) {
        const resetMs = parseDurationMs(params.headers.get('x-ratelimit-reset-tokens')) ?? 60_000
        state.reportedRemainingTokens = rem
        state.reportedResetAt = now + resetMs
      }
    }
  }
}

/** Reset state in unit tests. */
export function resetRateLimiterForTests(): void {
  providerStates.clear()
}
