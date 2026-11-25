import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServiceRoleKey } from './supabase-admin'
import { CRAWL_PROMPTS, type CrawlOperation } from './ai/crawl-prompts'
import { getModelConfigForOperation, AI_FALLBACK_TEMPLATE, CURRENT_AI_MODE, type FallbackTargetConfig, type ModelConfig } from '../config/ai-models'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface GenerateRequest {
  signal?: AbortSignal
  usage?: { inputTokens?: number; outputTokens?: number }
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
  /** Shared business key path dedicated strictly to Onboarding website crawling. */
  useSharedCrawlKey?: boolean
  crawlOperation?: CrawlOperation
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  providerTimeoutMs?: number
}

interface KeyRow {
  workspace_id: string
  provider: string
  model: string
  custom_base_url: string | null
  status: string
}

async function decryptKey(workspaceId: string, admin: SupabaseClient): Promise<string | null> {
  const { data: rootData } = await admin
    .from('app_secrets')
    .select('value')
    .eq('name', 'ai_key_root')
    .maybeSingle()
  const { data: keyData } = await admin
    .from('ai_keys')
    .select('key_ciphertext')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!rootData?.value || !keyData?.key_ciphertext) return null

  // decrypt using pgp_sym_decrypt through an RPC run as service role
  const { data, error } = await admin.rpc('read_ai_key', { p_workspace: workspaceId })
  if (error || !data) return null
  return data as string
}

export async function generateAi(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') return new Response(null, { status: 405, headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) ?? ''
    // Two distinct admin clients are deliberately separated:
    //  - The shared-crawl path only needs to verify the caller's JWT and, when
    //    AI_API_KEY is present, never touches a service_role-only credential. An
    //    anon/publishable key can verify the JWT via admin.auth.getUser(token),
    //    so it is enough there.
    //  - The task path (reserve_task_call, read_ai_key, tasks/ai_keys tables) is
    //    granted to service_role only and fails closed below.
    const serviceKey = getServiceRoleKey()
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const adminKey = serviceKey || anonKey
    if (!supabaseUrl || !adminKey) {
      return new Response(JSON.stringify({ error: 'server_misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const admin = createClient(supabaseUrl, adminKey)

    const body = (await req.json()) as GenerateRequest
    body.signal = req.signal
    if (typeof body.userPrompt !== 'string' || !body.userPrompt.trim() || body.userPrompt.length > 50000) {
      return new Response(JSON.stringify({ error: 'missing prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // verify the caller's JWT and identify their workspace if token is provided
    let workspaceId = ''
    if (token) {
      const { data: userData } = await admin.auth.getUser(token)
      if (userData?.user) workspaceId = userData.user.id
    }

    if (body.useSharedCrawlKey === true) {
      return await handleSharedCrawlRequest(admin, body, workspaceId || 'server')
    }

    return new Response(JSON.stringify({ error: 'shared_key_not_allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error && /^(invalid_key|invalid_output|truncated_json_response|unexpected_provider_response|provider_error_\d{3}|missing_base_url|unapproved_base_url)$/.test(err.message) ? err.message : 'provider_unavailable'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

export function resolveApiKeyForProvider(provider: string, explicitKey?: string | null): string | null {
  if (explicitKey) return explicitKey
  switch (provider) {
    case 'dahl':
      return process.env.DAHL_API_KEY || process.env.AI_DAHL_API_KEY || process.env.AI_API_KEY || null
    case 'sovereigneg':
      return process.env.SOVEREIGNEG_API_KEY || process.env.AI_SOVEREIGNEG_API_KEY || process.env.AI_API_KEY || null
    case 'groq':
      return process.env.GROQ_API_KEY || process.env.AI_API_KEY || null
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || null
    case 'openai':
      return process.env.OPENAI_API_KEY || null
    case 'google':
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY || null
    default:
      return process.env.AI_API_KEY || null
  }
}

export interface ExecutionTarget {
  provider: ModelConfig['provider'] | string
  model: string
  baseUrl?: string | null
  apiKey?: string | null
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  timeoutMs?: number
}

export interface FallbackExecutionResult {
  text: string
  target: ExecutionTarget
  attemptIndex: number
  fallbackUsed: boolean
}

/**
 * Reusable execution template: executes an AI request with transparent multi-tiered fallback.
 * 1. Tries primary target.
 * 2. If it fails, times out, or produces invalid output, automatically falls back to:
 *    - Fallback: openai/gpt-oss-120b on Groq (default reasoning)
 *    - Emergency Fallback: openai/gpt-oss-20b on Groq (default reasoning)
 * 3. Can be called by ANY operation or request across the application.
 */
export async function executeWithFallback(options: {
  primary: ExecutionTarget
  fallbacks?: readonly FallbackTargetConfig[] | ExecutionTarget[]
  request: GenerateRequest
  validate?: (text: string) => boolean
  totalDeadlineMs?: number
  logPrefix?: string
}): Promise<FallbackExecutionResult> {
  const {
    primary,
    fallbacks = AI_FALLBACK_TEMPLATE,
    request,
    validate,
    totalDeadlineMs = 45000,
    logPrefix = '[ai-fallback]',
  } = options

  // In test mode, SovereignEG is strictly excluded so no tokens are consumed.
  const isTestMode = CURRENT_AI_MODE === 'test'
  const effectivePrimary = isTestMode && primary.provider === 'sovereigneg' ? null : primary
  const targets: ExecutionTarget[] = effectivePrimary ? [effectivePrimary] : []
  if (isTestMode && !effectivePrimary) {
    console.warn(`${logPrefix} Skipping SovereignEG primary in test mode (AI_MODE=test)`)
  }
  for (const fb of fallbacks) {
    if (isTestMode && fb.provider === 'sovereigneg') {
      console.warn(`${logPrefix} Skipping SovereignEG fallback ${fb.model} in test mode (AI_MODE=test)`)
      continue
    }
    if (effectivePrimary && fb.provider === effectivePrimary.provider && fb.model === effectivePrimary.model) continue
    targets.push({
      provider: fb.provider,
      model: fb.model,
      baseUrl: (fb as ExecutionTarget).baseUrl ?? (
        fb.provider === 'dahl'
          ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1')
          : fb.provider === 'sovereigneg'
            ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1')
            : null
      ),
      apiKey: (fb as ExecutionTarget).apiKey ?? resolveApiKeyForProvider(fb.provider),
      reasoningEffort: fb.reasoningEffort,
      timeoutMs: fb.timeoutMs ?? 20000,
    })
  }

  const deadline = Date.now() + totalDeadlineMs
  let lastError: Error | null = null

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    const remaining = deadline - Date.now()
    if (remaining < 2000) break

    const apiKey = target.apiKey || resolveApiKeyForProvider(target.provider)
    if (!apiKey) {
      console.warn(`${logPrefix} Skipping target ${target.provider}/${target.model}: no API key available`)
      continue
    }

    const targetRequest: GenerateRequest = {
      ...request,
      reasoningEffort: target.reasoningEffort ?? (target.provider === 'groq' && target.model.includes('gpt-oss') ? undefined : request.reasoningEffort),
      providerTimeoutMs: Math.min(target.timeoutMs ?? 20000, remaining),
    }

    const keyRow: KeyRow = {
      workspace_id: '',
      provider: target.provider,
      model: target.model,
      custom_base_url: target.baseUrl ?? (target.provider === 'dahl' ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1') : null),
      status: 'active',
    }

    try {
      const text = await callProvider(keyRow, apiKey, targetRequest)
      if (!text || !text.trim()) throw new Error('empty_provider_response')

      if (validate && !validate(text)) {
        throw new Error('invalid_output')
      }

      return {
        text,
        target,
        attemptIndex: i,
        fallbackUsed: i > 0,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      const nextTarget = targets[i + 1]
      if (nextTarget) {
        console.warn(`${logPrefix} Target ${target.provider}/${target.model} failed (${lastError.message}). Falling back to: ${nextTarget.provider}/${nextTarget.model}`)
      } else {
        console.warn(`${logPrefix} Target ${target.provider}/${target.model} failed (${lastError.message}). All fallback options exhausted.`)
      }
    }
  }

  throw lastError ?? new Error('all_targets_failed')
}

async function handleSharedCrawlRequest(
  admin: SupabaseClient,
  body: GenerateRequest,
  workspaceId: string
): Promise<Response> {
  // Fixed operations own their prompts; caller-controlled prompt fragments are not authorization.
  const operation = body.crawlOperation
  if (!operation || !['extract', 'extract_ar', 'relate'].includes(operation)) {
    return new Response(JSON.stringify({ error: 'shared_key_not_allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const crawlConfig = getModelConfigForOperation(operation)
  const baseRequest: GenerateRequest = {
    systemPrompt: CRAWL_PROMPTS[operation as CrawlOperation],
    userPrompt: body.userPrompt,
    signal: body.signal,
    jsonMode: true,
    temperature: 0.1,
    maxTokens: operation === 'relate' ? 2500 : (crawlConfig.maxTokens ?? 5000),
    providerTimeoutMs: 25000,
    reasoningEffort: crawlConfig.reasoningEffort ?? body.reasoningEffort ?? 'none',
  }

  // Primary: DeepSeek-V4-Flash via general Dahl provider
  const dahlKey = process.env.DAHL_API_KEY || process.env.AI_DAHL_API_KEY || process.env.AI_CRAWL_API_KEY || process.env.AI_API_KEY || null
  const dahlBaseUrl = process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1'

  // Fallback: Groq API key
  const fallbackKey = process.env.GROQ_API_KEY || process.env.AI_API_KEY || null

  let sharedRpcKey: string | null = null
  if (!dahlKey && !fallbackKey) {
    const { data: rpcSecret, error: secretError } = await admin.rpc('read_shared_crawl_key')
    if (!secretError && rpcSecret) sharedRpcKey = String(rpcSecret)
  }

  const effectiveDahlKey = dahlKey || sharedRpcKey
  const effectiveFallbackKey = fallbackKey || sharedRpcKey

  if (!effectiveDahlKey && !effectiveFallbackKey) {
    // A personal key is optional; it is read and used entirely on the server.
    const { data: meta } = await admin
      .from('ai_keys')
      .select('workspace_id, provider, model, custom_base_url, status')
      .eq('workspace_id', workspaceId).maybeSingle()
    if (meta?.status === 'active') {
      const personalKey = await decryptKey(workspaceId, admin)
      if (personalKey) {
        const text = await callProvider(meta as KeyRow, personalKey, baseRequest)
        return new Response(JSON.stringify({ text }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }
    return new Response(JSON.stringify({ error: 'shared_key_unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const primaryApiKey = crawlConfig.provider === 'dahl'
    ? effectiveDahlKey
    : crawlConfig.provider === 'sovereigneg'
      ? resolveApiKeyForProvider('sovereigneg')
      : (effectiveFallbackKey || resolveApiKeyForProvider(crawlConfig.provider))
  const primaryBaseUrl = crawlConfig.provider === 'dahl'
    ? dahlBaseUrl
    : crawlConfig.provider === 'sovereigneg'
      ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1')
      : null
  const primaryTimeout = crawlConfig.provider === 'dahl' ? 25000 : 20000

  try {
    const result = await executeWithFallback({
      primary: {
        provider: crawlConfig.provider,
        model: crawlConfig.model,
        apiKey: primaryApiKey,
        baseUrl: primaryBaseUrl,
        reasoningEffort: crawlConfig.reasoningEffort,
        timeoutMs: primaryTimeout,
      },
      fallbacks: AI_FALLBACK_TEMPLATE.map((fb) => ({
        ...fb,
        apiKey: fb.provider === 'dahl'
          ? (effectiveDahlKey || resolveApiKeyForProvider('dahl'))
          : fb.provider === 'sovereigneg'
            ? resolveApiKeyForProvider('sovereigneg')
            : (effectiveFallbackKey || resolveApiKeyForProvider(fb.provider)),
        baseUrl: fb.provider === 'dahl'
          ? dahlBaseUrl
          : fb.provider === 'sovereigneg'
            ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1')
            : null,
      })),
      request: baseRequest,
      totalDeadlineMs: 45000,
      logPrefix: '[shared-crawl]',
      validate: (text) => {
        try {
          const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
          return Boolean(parsed && typeof parsed === 'object' && (Array.isArray(parsed.candidates) || Array.isArray(parsed.edges)))
        } catch {
          return false
        }
      },
    })

    return new Response(JSON.stringify({ text: result.text }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // If all shared targets in fallback template failed, try personal key if available before giving up
    const { data: meta } = await admin
      .from('ai_keys')
      .select('workspace_id, provider, model, custom_base_url, status')
      .eq('workspace_id', workspaceId).maybeSingle()
    if (meta?.status === 'active') {
      const personalKey = await decryptKey(workspaceId, admin)
      if (personalKey) {
        try {
          const text = await callProvider(meta as KeyRow, personalKey, baseRequest)
          return new Response(JSON.stringify({ text }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        } catch {}
      }
    }

    // Never leak raw provider text. Reuse the same whitelist as the task path above.
    const rawMessage = err instanceof Error ? err.message : 'generation failed'
    const message = /^(invalid_key|invalid_output|truncated_json_response|unexpected_provider_response|provider_error_\d{3}|missing_base_url|unapproved_base_url)$/.test(rawMessage) ? rawMessage : 'provider_unavailable'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

async function callProvider(
  key: KeyRow,
  apiKey: string,
  body: GenerateRequest
): Promise<string> {
  const isHigh = body.reasoningEffort === 'high'
  const maxTokens = (isHigh && body.maxTokens === undefined) ? undefined : Math.min(Math.max(body.maxTokens ?? 4096, 100), 8000)
  const temperature = Math.min(Math.max(body.temperature ?? 0.7, 0), 1)
  const providerTimeout = Math.min(isHigh ? 60000 : 25000, Math.max(1000, body.providerTimeoutMs ?? (isHigh ? 45000 : 25000)))

  if (key.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      signal: body.signal ? AbortSignal.any([body.signal, AbortSignal.timeout(providerTimeout)]) : AbortSignal.timeout(providerTimeout),
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: key.model,
        max_tokens: Math.min(maxTokens ?? 4096, 4096),
        temperature,
        system: body.systemPrompt,
        messages: [{ role: 'user', content: body.userPrompt }],
      }),
    })
    if (res.status === 401 || res.status === 403) throw new Error('invalid_key')
    if (!res.ok) throw new Error(`provider_error_${res.status}`)
    const data = await res.json()
    const text = data?.content?.[0]?.text
    if (typeof text !== 'string') throw new Error('unexpected_provider_response')
    if (body.jsonMode && data?.stop_reason === 'max_tokens') throw new Error('truncated_json_response')

    body.usage = { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }

    return text
  }

  // OpenAI-compatible: openai, groq, google (gemini open-compat), openrouter, dahl, sovereigneg, custom
  const base =
    key.provider === 'openai'
      ? 'https://api.openai.com/v1'
      : key.provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : key.provider === 'google'
          ? 'https://generativelanguage.googleapis.com/v1beta/openai'
          : key.provider === 'openrouter'
            ? 'https://openrouter.ai/api/v1'
            : key.provider === 'dahl'
              ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1').replace(/\/$/, '')
              : key.provider === 'sovereigneg'
                ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1').replace(/\/$/, '')
                : (key.custom_base_url ?? '').replace(/\/$/, '')
  if (!base) throw new Error('missing_base_url')
  if (key.provider === 'custom') {
    const configuredAllowed = (process.env.AI_ALLOWED_BASE_URLS ?? '').split(',').map(x => x.trim()).filter(Boolean)
    const allowed = [...new Set([...configuredAllowed, 'https://inference.dahl.global/v1', 'https://backend.sovereigneg.com/v1'])]
    if (!base.startsWith('https://') || !allowed.includes(base)) throw new Error('unapproved_base_url')
  }

  const res = await fetch(`${base}/chat/completions`, {
    signal: body.signal ? AbortSignal.any([body.signal, AbortSignal.timeout(providerTimeout)]) : AbortSignal.timeout(providerTimeout),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: key.model,
      ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
      temperature,
      messages: [
        { role: 'system', content: body.systemPrompt },
        { role: 'user', content: body.userPrompt },
      ],
      ...(body.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(body.reasoningEffort && !(key.provider === 'groq' && key.model.startsWith('openai/gpt-oss-')) ? {
        reasoning_effort: key.provider === 'groq'
          ? (body.reasoningEffort === 'none' ? undefined : (body.jsonMode && body.reasoningEffort === 'high' ? 'medium' : body.reasoningEffort))
          : body.reasoningEffort,
      } : {}),
    }),
  })
  if (res.status === 401 || res.status === 403) throw new Error('invalid_key')
  if (!res.ok) throw new Error(`provider_error_${res.status}`)
  const data = await res.json()
  const choice = data?.choices?.[0]
  const text = choice?.message?.content
  if (typeof text !== 'string') throw new Error('unexpected_provider_response')
  if (body.jsonMode && choice?.finish_reason === 'length') throw new Error('truncated_json_response')

  body.usage = { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens }

  return text
}