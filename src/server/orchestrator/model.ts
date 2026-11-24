import 'server-only'
import { generateAi } from '../ai-generate'
import type { AiCallResult, ProviderAttemptInfo } from '../../lib/agents'

/**
 * Call the Orchestrator model for a single JSON decision or Brain-grounded answer
 * (legacy `orchestrate` / `brain_answer` operations). Retained for the original
 * gateway; the V2 path uses callOrchestratorV2Model below.
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
    return { ok: false, text: '', error: response.status === 401 ? 'unauthorized' : reason === 'no_active_key' ? 'no_active_key' : reason === 'invalid_key' ? 'invalid_key' : 'provider_error', reason, retryable: response.status === 429 || response.status >= 500 }
  } catch (error) {
    return { ok: false, text: '', error: error instanceof Error && /Timeout|Abort/.test(error.name) ? 'timeout' : 'network_error', retryable: !input.signal?.aborted }
  }
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolDef {
  name: string
  description?: string
  parameters: unknown
}

export interface AgentRoleModelResult extends AiCallResult {
  toolCalls: ToolCall[]
}

function parseToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return []
  return (raw as { id?: unknown; name?: unknown; args?: unknown }[])
    .filter((tc) => typeof tc?.name === 'string')
    .map((tc) => {
      let args: Record<string, unknown> = {}
      if (typeof tc.args === 'string') {
        try { args = JSON.parse(tc.args) as Record<string, unknown> } catch { args = {} }
      } else if (tc.args && typeof tc.args === 'object') {
        args = tc.args as Record<string, unknown>
      }
      return { id: typeof tc.id === 'string' ? tc.id : crypto.randomUUID(), name: String(tc.name), args }
    })
}

/**
 * Call a role agent (Director / specialist) for one turn. Supports native OpenAI
 * tool calling (preferred) as well as plain text or JSON action responses.
 */
export async function callAgentRoleModel(input: {
  role: 'director' | 'research' | 'content' | 'marketing_analyst'
  systemPrompt: string
  messages: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }[]
  tools?: ToolDef[]
  jsonMode?: boolean
  accessToken: string
  signal?: AbortSignal
}): Promise<AgentRoleModelResult> {
  const noToolCalls: ToolCall[] = []
  try {
    const hasTools = Array.isArray(input.tools) && input.tools.length > 0
    const response = await generateAi(
      new Request('http://internal/api/ai', {
        method: 'POST',
        signal: input.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + input.accessToken },
        body: JSON.stringify({
          operation: 'agent_role',
          role: input.role,
          systemPrompt: input.systemPrompt,
          userPrompt: '',
          messages: input.messages,
          ...(hasTools ? { tools: input.tools!.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })), toolChoice: 'auto' } : {}),
          jsonMode: input.jsonMode ?? false,
        }),
      }),
    )
    const data = await response.json().catch(() => ({})) as {
      text?: unknown
      toolCalls?: unknown
      error?: unknown
      usage?: unknown
      usageKnown?: unknown
      provider?: unknown
      model?: unknown
      attempt?: unknown
      fallbackUsed?: unknown
      attempts?: unknown
    }
    const attempts = Array.isArray(data.attempts) ? (data.attempts as ProviderAttemptInfo[]) : undefined
    if (response.ok && (typeof data.text === 'string' || Array.isArray(data.toolCalls))) {
      return {
        ok: true,
        text: typeof data.text === 'string' ? data.text : '',
        toolCalls: parseToolCalls(data.toolCalls),
        usage: data.usage as AiCallResult['usage'],
        usageKnown: typeof data.usageKnown === 'boolean' ? data.usageKnown : undefined,
        provider: typeof data.provider === 'string' ? data.provider : undefined,
        model: typeof data.model === 'string' ? data.model : undefined,
        attempt: typeof data.attempt === 'number' ? data.attempt : undefined,
        fallbackUsed: typeof data.fallbackUsed === 'boolean' ? data.fallbackUsed : undefined,
        attempts,
      }
    }
    const reason = typeof data.error === 'string' ? data.error : `http_${response.status}`
    return {
      ok: false,
      text: '',
      toolCalls: noToolCalls,
      error: response.status === 401 ? 'unauthorized' : reason === 'no_active_key' ? 'no_active_key' : reason === 'invalid_key' ? 'invalid_key' : 'provider_error',
      reason,
      retryable: response.status === 429 || response.status >= 500,
      attempts,
    }
  } catch (error) {
    return { ok: false, text: '', toolCalls: noToolCalls, error: error instanceof Error && /Timeout|Abort/.test(error.name) ? 'timeout' : 'network_error', retryable: !input.signal?.aborted }
  }
}

export interface OrchestratorV2ModelResult extends AiCallResult {
  toolCalls: ToolCall[]
}

/**
 * Call the Orchestrator V2 model for one turn of the tool-calling loop.
 * Returns assistant text plus any requested tool calls (validated downstream by
 * the central registry). Bounded by the fixed V2 system prompt, a low token cap
 * and a short timeout. No task row or allowance is reserved.
 */
export async function callOrchestratorV2Model(input: {
  systemPrompt: string
  messages: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }[]
  tools: ToolDef[]
  accessToken: string
  signal?: AbortSignal
}): Promise<OrchestratorV2ModelResult> {
  const noToolCalls: ToolCall[] = []
  try {
    const response = await generateAi(
      new Request('http://internal/api/ai', {
        method: 'POST',
        signal: input.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + input.accessToken },
        body: JSON.stringify({
          operation: 'orchestrate_v2',
          systemPrompt: input.systemPrompt,
          userPrompt: '',
          messages: input.messages,
          tools: input.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
          toolChoice: 'auto',
        }),
      }),
    )
    const data = await response.json().catch(() => ({})) as {
      text?: unknown
      toolCalls?: unknown
      error?: unknown
      usage?: unknown
      usageKnown?: unknown
      provider?: unknown
      model?: unknown
      attempt?: unknown
      fallbackUsed?: unknown
      attempts?: unknown
    }
    const attempts = Array.isArray(data.attempts) ? (data.attempts as ProviderAttemptInfo[]) : undefined
    if (response.ok && (typeof data.text === 'string' || Array.isArray(data.toolCalls))) {
      const toolCalls = parseToolCalls(data.toolCalls)
      return {
        ok: true,
        text: typeof data.text === 'string' ? data.text : '',
        toolCalls,
        usage: data.usage as AiCallResult['usage'],
        usageKnown: typeof data.usageKnown === 'boolean' ? data.usageKnown : undefined,
        provider: typeof data.provider === 'string' ? data.provider : undefined,
        model: typeof data.model === 'string' ? data.model : undefined,
        attempt: typeof data.attempt === 'number' ? data.attempt : undefined,
        fallbackUsed: typeof data.fallbackUsed === 'boolean' ? data.fallbackUsed : undefined,
        attempts,
      }
    }
    const reason = typeof data.error === 'string' ? data.error : `http_${response.status}`
    return {
      ok: false,
      text: '',
      toolCalls: noToolCalls,
      error: response.status === 401 ? 'unauthorized' : reason === 'no_active_key' ? 'no_active_key' : reason === 'invalid_key' ? 'invalid_key' : 'provider_error',
      reason,
      retryable: response.status === 429 || response.status >= 500,
      attempts,
    }
  } catch (error) {
    return {
      ok: false,
      text: '',
      toolCalls: noToolCalls,
      error: error instanceof Error && /Timeout|Abort/.test(error.name) ? 'timeout' : 'network_error',
      retryable: !input.signal?.aborted,
    }
  }
}