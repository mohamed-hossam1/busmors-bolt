import 'server-only'
import { generateAi } from '../ai-generate'
import type { AiCallResult } from '../../lib/agents'

/**
 * Call the Orchestrator model for a decision or a Brain-grounded answer.
 *
 * These operations run without a task row: `generateAi` routes `orchestrate` /
 * `brain_answer` to the bounded Orchestrator handler (fixed prompt, token cap,
 * short timeout). The workspace's own key or the managed key is used server-side.
 */
export async function callOrchestratorModel(input: {
  operation: 'orchestrate' | 'brain_answer'
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
        body: JSON.stringify({ operation: input.operation, userPrompt: input.userPrompt, signal: undefined }),
      }),
    )
    const data = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown; usage?: unknown; provider?: unknown; model?: unknown; attempt?: unknown; fallbackUsed?: unknown }
    if (response.ok && typeof data.text === 'string') return {
      ok: true,
      text: data.text,
      usage: data.usage as AiCallResult['usage'],
      provider: typeof data.provider === 'string' ? data.provider : undefined,
      model: typeof data.model === 'string' ? data.model : undefined,
      attempt: typeof data.attempt === 'number' ? data.attempt : undefined,
      fallbackUsed: typeof data.fallbackUsed === 'boolean' ? data.fallbackUsed : undefined,
    }
    const reason = typeof data.error === 'string' ? data.error : `http_${response.status}`
    return {
      ok: false,
      text: '',
      error: response.status === 401 ? 'unauthorized' : reason === 'no_active_key' ? 'no_active_key' : reason === 'invalid_key' ? 'invalid_key' : 'provider_error',
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