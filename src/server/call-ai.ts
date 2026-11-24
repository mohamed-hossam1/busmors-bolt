import 'server-only'
import { generateAi } from './ai-generate'
import { createServerSupabase, getServerSessionToken } from './supabase'
import type { AiCallResult, callAi as ClientCall } from '../lib/agents'

export async function callAi(input: Parameters<typeof ClientCall>[0], accessToken?: string): Promise<AiCallResult> {
  const token = accessToken ?? (await getServerSessionToken()) ?? (await (await createServerSupabase()).auth.getSession()).data.session?.access_token
  if (!token && !input.useSharedCrawlKey) return { ok: false, text: '', error: 'unauthorized' }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = 'Bearer ' + token
    const response = await generateAi(new Request('http://internal/api/ai', { method: 'POST', signal: input.signal, headers, body: JSON.stringify({ ...input, signal: undefined }) }))
    const data = await response.json()
    if (response.ok && typeof data.text === 'string') return { ok: true, text: data.text, usage: data.usage, callId: data.callId, provider: data.provider, model: data.model, attempt: data.attempt, fallbackUsed: data.fallbackUsed }
    return { ok: false, text: '', error: data.error === 'no_active_key' ? 'no_active_key' : response.status === 401 ? 'unauthorized' : 'provider_error', reason: data.error, retryable: response.status === 429 || (response.status >= 500 && !['invalid_key','budget_exhausted','run_not_active'].includes(data.error)) }
  } catch { return { ok: false, text: '', error: 'network_error', retryable: true } }
}
