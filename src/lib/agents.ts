import { supabase } from './supabase'

export type AiOperation = 'chat' | 'roadmap' | 'roadmap_answer' | 'roadmap_revision' | 'roadmap_checkin'

export interface AiCallResult {
  ok: boolean
  text: string
  error?: 'no_active_key' | 'invalid_key' | 'provider_error' | 'network_error' | 'timeout' | 'unauthorized'
  reason?: string
  retryable?: boolean
  usage?: { inputTokens?: number; outputTokens?: number; cachedTokens?: number; reasoningTokens?: number }
  callId?: string
  /** Winning provider/model/attempt after transparent fallback (fields only). */
  provider?: string
  model?: string
  attempt?: number
  fallbackUsed?: boolean
}

/** Provider credentials never leave the authenticated Next.js gateway. */
export async function callAi(input: {
  systemPrompt?: string
  userPrompt: string
  operation?: AiOperation
  taskId?: string
  runId?: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
  useSharedCrawlKey?: boolean
  crawlOperation?: 'extract' | 'extract_ar' | 'relate'
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  signal?: AbortSignal
}): Promise<AiCallResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, text: '', error: 'unauthorized' }
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, signal: undefined, operation: input.operation ?? 'chat', systemPrompt: undefined }),
      signal: input.signal ? AbortSignal.any([input.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(input.useSharedCrawlKey ? 35000 : 45000),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && typeof data.text === 'string') return { ok: true, text: data.text, usage: data.usage, callId: data.callId, provider: data.provider, model: data.model, attempt: data.attempt, fallbackUsed: data.fallbackUsed }
    const reason = typeof data.error === 'string' && /^(?:shared_key_unavailable|shared_key_not_allowed|unauthorized|no_active_key|invalid_key|invalid_output|budget_exhausted|run_not_active|truncated_json_response|unexpected_provider_response|provider_error_\d{3})$/.test(data.error) ? data.error : `http_${res.status}`
    return { ok: false, text: '', error: res.status === 401 ? 'unauthorized' : reason === 'no_active_key' ? 'no_active_key' : reason === 'invalid_key' ? 'invalid_key' : 'provider_error', reason, retryable: res.status === 429 || res.status >= 500 && !['invalid_output','invalid_key','budget_exhausted','run_not_active'].includes(reason) }
  } catch (error) { return { ok: false, text: '', error: error instanceof Error && /Timeout|Abort/.test(error.name) ? 'timeout' : 'network_error', retryable: !input.signal?.aborted } }
}
