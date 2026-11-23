import 'server-only'
import { generateAi } from './ai-generate'
import type { AiCallResult } from '../lib/agents'

/**
 * Ask the model for a short chat title (max ~60 chars) for a user's first
 * message. Runs without a task row or allowance, like the orchestrator's
 * orchestrate/brain_answer calls, using the workspace's key or the managed key.
 */
export async function callTitleModel(input: {
  userPrompt: string
  accessToken: string
  signal?: AbortSignal
}): Promise<AiCallResult> {
  try {
    const response = await generateAi(
      new Request('http://internal/api/ai', {
        method: 'POST',
        signal: input.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + input.accessToken },
        body: JSON.stringify({ operation: 'title', userPrompt: input.userPrompt, signal: undefined }),
      }),
    )
    const data = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown }
    if (response.ok && typeof data.text === 'string') return { ok: true, text: data.text }
    const reason = typeof data.error === 'string' ? data.error : `http_${response.status}`
    return {
      ok: false,
      text: '',
      error: reason === 'no_active_key' ? 'no_active_key' : 'provider_error',
      reason,
      retryable: response.status === 429 || response.status >= 500,
    }
  } catch (error) {
    return {
      ok: false,
      text: '',
      error: error instanceof Error && /Timeout|Abort/.test(error.name) ? 'timeout' : 'network_error',
      retryable: !input.signal?.aborted,
    }
  }
}

/** Clamp the model output to a safe title length and strip surrounding noise. */
export function cleanChatTitle(text: string): string {
  return text
    .replace(/^["']+|["']+$/g, '')
    .replace(/[.!?،؛]+$/, '')
    .trim()
    .slice(0, 60)
}
