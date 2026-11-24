// [functions.ai-generate]
// verify_jwt = true

import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getServiceRoleKey, hasServiceRoleKey } from './supabase-admin'
import { OPERATIONS, validateOutput, type Operation } from './ai/operations'
import { CRAWL_PROMPTS, type CrawlOperation } from './ai/crawl-prompts'
import { getModelConfigForOperation, AI_FALLBACK_TEMPLATE, CURRENT_AI_MODE, getEmployeeRoleRoute, type FallbackTargetConfig, type ModelConfig, type EmployeeRole } from '../config/ai-models'
import { ROLE_TEMPERATURE } from '../features/agents/contracts'
import type { ProviderAttemptInfo } from '../lib/agents'
import { checkProviderPreflight, estimateSerializedTokens, recordProviderOutcome } from './ai/rate-limiter'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

// Orchestrator chat operations run without a task/allowance row: they are bounded
// by a fixed system prompt, a low token cap and a short provider timeout.
// `roadmap` is included: it is a one-shot, server-owned generation from confirmed
// Discovery answers (no task row, no research allowance), like brain_answer.
const ORCHESTRATOR_OPERATIONS = new Set<string>(['orchestrate', 'orchestrate_v2', 'brain_answer', 'title', 'roadmap', 'roadmap_answer', 'roadmap_revision', 'roadmap_checkin'])

interface GenerateRequest {
  signal?: AbortSignal
  taskId?: string
  runId?: string
  operation?: Operation
  usage?: { inputTokens?: number; outputTokens?: number }
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
  /** OpenAI-style tool definitions for native tool-calling (Orchestrator V2). */
  tools?: { type: 'function'; function: { name: string; description?: string; parameters: unknown } }[]
  /** When set, the provider is asked to call one of the supplied tools. */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
  /** Multi-turn messages for tool loops (overrides system+user when present). */
  messages?: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }[]
  /** When true, uses the shared business key instead of the caller's own key.
   * Only allowed for onboarding website crawling (extraction of the caller's
   * own submitted site) — the shared key is the business's, not the user's. */
  useSharedCrawlKey?: boolean
  crawlOperation?: CrawlOperation
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  providerTimeoutMs?: number
}

/** A tool call requested by the model (OpenAI-compatible shape). */
export interface ToolCallRequest {
  id: string
  name: string
  args: string
}

export interface ToolCallResponse {
  text: string
  toolCalls: ToolCallRequest[]
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
    //    GROQ_API_KEY is present, never touches a service_role-only credential. An
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
    const hasMessages = Array.isArray(body.messages) && body.messages.length > 0
    const promptOk = typeof body.userPrompt === 'string' && body.userPrompt.trim().length > 0 && body.userPrompt.length <= 50000
    if (!promptOk && !hasMessages) {
      return new Response(JSON.stringify({ error: 'missing prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (typeof body.userPrompt === 'string' && body.userPrompt.length > 50000) {
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

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Orchestrator V2 native tool-calling path: one model turn with tools.
    // Bounded by the fixed V2 system prompt, a low token cap and a short timeout.
    if ((body.operation as string) === 'orchestrate_v2') {
      return await handleOrchestratorV2Request(admin, body, workspaceId)
    }

    // Agent role turn (Director / specialists): structured JSON action, role-routed
    // via getEmployeeRoleRoute, no task row. Application-mediated calling.
    if ((body.operation as string) === 'agent_role') {
      return await handleAgentRoleRequest(admin, body, workspaceId)
    }

    // Everything below is the task path. It needs service_role-only RPCs
    // (reserve_task_call, finish_task_call, read_ai_key) and direct tasks/ai_keys
    // table access, so it must fail closed when only the anon key is available.
    // The shared-crawl path above is the only path that benefits from an
    // anon-key admin client.
    if (!hasServiceRoleKey()) {
      return new Response(JSON.stringify({ error: 'server_misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!body.operation || !Object.hasOwn(OPERATIONS, body.operation)) {
      return new Response(JSON.stringify({ error: 'invalid_operation', code: 'INVALID_OPERATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    body.systemPrompt = OPERATIONS[body.operation]
    const opConfig = getModelConfigForOperation(body.operation)

    // The Orchestrator path answers/decides without a task row or allowance.
    if (ORCHESTRATOR_OPERATIONS.has(body.operation)) {
      return await handleOrchestratorRequest(admin, body, workspaceId)
    }

    body.usage = undefined
    body.jsonMode = !['chat'].includes(body.operation)
    const isHigh = opConfig.reasoningEffort === 'high' || body.reasoningEffort === 'high'
    if (isHigh) {
      body.reasoningEffort = 'high'
      body.maxTokens = undefined
    } else {
      body.maxTokens = Math.min(Math.max(Number.isFinite(body.maxTokens) ? body.maxTokens! : (opConfig.maxTokens ?? 3500), 100), 6000)
      body.reasoningEffort = body.reasoningEffort ?? opConfig.reasoningEffort
    }
    if (opConfig.temperature !== undefined && body.temperature === undefined) {
      body.temperature = opConfig.temperature
    }
    body.providerTimeoutMs = isHigh ? 45000 : 25000
    if (!body.taskId || !body.runId || !/^[0-9a-f-]{36}$/i.test(body.taskId) || !/^[0-9a-f-]{36}$/i.test(body.runId)) {
      return new Response(JSON.stringify({error:'run_not_active'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}})
    }
    const {data:task,error:taskError}=await admin.from('tasks').select('id,workspace_id,run_id,status').eq('id',body.taskId).eq('workspace_id',workspaceId).maybeSingle()
    if(taskError||!task||task.run_id!==body.runId||task.status!=='running')return new Response(JSON.stringify({error:'run_not_active'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}})

    const { data: keyMeta } = await admin
      .from('ai_keys')
      .select('workspace_id, provider, model, custom_base_url, status')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    let key = (keyMeta as KeyRow | null) ?? null
    let managedKey: string | null = null
    if (!key || key.status !== 'active') {
      const provider = opConfig.provider || process.env.AI_PROVIDER || 'groq'
      const model = opConfig.model || process.env.AI_MODEL || 'openai/gpt-oss-120b'
      managedKey = resolveApiKeyForProvider(provider)
      if (managedKey && provider && model) key = { workspace_id: workspaceId, provider, model, custom_base_url: process.env.AI_BASE_URL ?? null, status: 'active' }
    }

    if (!key || key.status !== 'active') {
      return new Response(JSON.stringify({ error: 'no_active_key' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const plaintextKey = managedKey ?? await decryptKey(workspaceId, admin)
    if (!plaintextKey) {
      return new Response(JSON.stringify({ error: 'no_active_key' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callId=crypto.randomUUID()
    // Byte count is deliberately conservative when a tokenizer/usage is unavailable.
    // reserve_task_call rejects a limit outside 1..50000 (INVALID_CALL); clamp so an
    // oversized prompt surfaces as a real budget/validation error, not run_not_active.
    // One token per byte overstated prompts about 3-4x (gpt-oss averages ~4 bytes
    // per English token and >=3 for Arabic/emoji), and a failed call is charged its
    // full reservation, so two failures could exhaust a 16k allowance on routing
    // alone. bytes/3 still stays above real token counts for practical text.
    const tokenLimit=Math.min(50000,Math.ceil(new TextEncoder().encode(body.systemPrompt+body.userPrompt).length/3)+(body.maxTokens ?? 8000)+256)
    const {error:reservationError}=await admin.rpc('reserve_task_call',{p_task_id:task.id,p_run_id:body.runId,p_call_id:callId,p_operation:body.operation,p_token_limit:tokenLimit})
    if(reservationError)return new Response(JSON.stringify({error:reservationError.message.includes('BUDGET_EXHAUSTED')?'budget_exhausted':'run_not_active'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}})
    let succeeded=false
    try {
      const result = await executeWithFallback({
        primary: {
          provider: key.provider,
          model: key.model,
          apiKey: plaintextKey,
          baseUrl: key.custom_base_url,
          reasoningEffort: body.reasoningEffort,
          timeoutMs: body.providerTimeoutMs,
        },
        fallbacks: AI_FALLBACK_TEMPLATE,
        request: body,
        validate: (generated) => {
          const operation = body.operation as Operation
          const isValid = validateOutput(operation, generated)
          if (!isValid && process.env.NODE_ENV !== 'production') {
            let shape = 'unparseable'
            try {
              shape = JSON.stringify(JSON.parse(generated), (k, value) => k && typeof value !== 'object' ? (typeof value === 'number' || k === 'mode' || k === 'intent' ? value : typeof value) : value).slice(0, 600)
            } catch {}
            console.warn('[ai-generate] invalid_output', operation, shape)
          }
          return isValid
        },
        logPrefix: '[task-generate]',
      })
      const generated = result.text
      succeeded = true
      return new Response(JSON.stringify({ text: generated, usage: body.usage ?? null, callId, provider: result.target.provider, model: result.target.model, attempt: result.attemptIndex, fallbackUsed: result.fallbackUsed }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } finally {
      const {error:usageError}=await admin.rpc('finish_task_call',{p_task_id:task.id,p_call_id:callId,p_success:succeeded,p_usage:body.usage??{}})
      if(usageError)throw new Error('usage_record_failed')
    }
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
      return process.env.DAHL_API_KEY || process.env.AI_DAHL_API_KEY || null
    case 'sovereigneg':
      return process.env.SOVEREIGNEG_API_KEY || process.env.AI_SOVEREIGNEG_API_KEY || null
    case 'groq':
      return process.env.GROQ_API_KEY || null
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY || null
    case 'openai':
      return process.env.OPENAI_API_KEY || null
    case 'google':
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || null
    case 'openrouter':
      return process.env.OPENROUTER_API_KEY || null
    default:
      // The managed provider key is the Groq key (formerly AI_API_KEY).
      return process.env.GROQ_API_KEY || null
  }
}

export interface ExecutionTarget {
  provider: ModelConfig['provider'] | string
  model: string
  baseUrl?: string | null
  apiKey?: string | null
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  timeoutMs?: number
  inputCap?: number
  completionCap?: number
}

export interface FallbackExecutionResult {
  text: string
  target: ExecutionTarget
  attemptIndex: number
  fallbackUsed: boolean
  usage?: { inputTokens?: number; outputTokens?: number; cachedTokens?: number; reasoningTokens?: number }
  usageKnown: boolean
  toolCalls?: ToolCallRequest[]
  attempts: ProviderAttemptInfo[]
}

type ErrorCategory = NonNullable<ProviderAttemptInfo['errorCategory']>

class ProviderCallError extends Error {
  readonly category: ErrorCategory
  readonly statusCode: number | null
  readonly retryable: boolean
  constructor(message: string, category: ErrorCategory, statusCode: number | null = null, retryable = true) {
    super(message)
    this.category = category
    this.statusCode = statusCode
    this.retryable = retryable
  }
}

/**
 * Compact older non-system messages when falling back to a tighter provider cap,
 * keeping system instructions, initial task context, and recent turns intact.
 */
function compactMessagesForCap(
  messages: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string; name?: string }[] | undefined,
  maxTokens: number,
  systemPrompt: string,
  tools?: unknown[],
): typeof messages {
  if (!messages || messages.length <= 3) return messages
  const est = estimateSerializedTokens({ systemPrompt, messages, tools })
  if (est <= maxTokens) return messages
  const out = messages.map((m) => ({ ...m }))
  for (let i = 1; i < out.length - 2; i++) {
    if (out[i].role === 'tool' && typeof out[i].content === 'string' && out[i].content!.length > 600) {
      out[i].content = out[i].content!.slice(0, 600) + '… [compacted]'
    }
    if (estimateSerializedTokens({ systemPrompt, messages: out, tools }) <= maxTokens) break
  }
  return out
}

/**
 * Reusable execution template: executes an AI request with transparent multi-tiered fallback.
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
      timeoutMs: fb.timeoutMs ?? 25000,
      inputCap: (fb as ExecutionTarget).inputCap ?? (fb.provider === 'groq' ? 6500 : 12000),
      completionCap: (fb as ExecutionTarget).completionCap ?? (fb.provider === 'groq' ? 2500 : 2500),
    })
  }

  const deadline = Date.now() + totalDeadlineMs
  let lastError: Error | null = null
  const attempts: ProviderAttemptInfo[] = []

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]
    const remaining = deadline - Date.now()
    if (remaining < 2000) break
    if (request.signal?.aborted) {
      const nowIso = new Date().toISOString()
      attempts.push({
        provider: target.provider,
        model: target.model,
        attemptIndex: i,
        fallbackUsed: i > 0,
        status: 'aborted',
        error: 'aborted',
        errorCategory: 'aborted',
        statusCode: null,
        usage: null,
        usageKnown: false,
        startedAt: nowIso,
        endedAt: nowIso,
        durationMs: 0,
      })
      const err = new Error('aborted')
      ;(err as { attempts?: ProviderAttemptInfo[] }).attempts = attempts
      throw err
    }

    const apiKey = target.apiKey || resolveApiKeyForProvider(target.provider)
    if (!apiKey) {
      console.warn(`${logPrefix} Skipping target ${target.provider}/${target.model}: no API key available`)
      continue
    }

    const targetMessages = target.inputCap
      ? compactMessagesForCap(request.messages, target.inputCap, request.systemPrompt, request.tools)
      : request.messages

    const targetMaxTokens = target.completionCap
      ? Math.min(request.maxTokens ?? target.completionCap, target.completionCap)
      : request.maxTokens

    const estimatedInput = estimateSerializedTokens({
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      messages: targetMessages as { role: string; content: string | null }[] | undefined,
      tools: request.tools,
    })

    let preflight = checkProviderPreflight({
      provider: target.provider,
      model: target.model,
      estimatedInputTokens: estimatedInput,
      inputCap: target.inputCap,
      completionCap: targetMaxTokens,
    })

    // If blocked ONLY by a short provider TPM reset window on the final available
    // target (e.g. Groq multi-turn loop after reading search/scrape output), honor
    // the reset header once within the remaining request deadline.
    if (
      !preflight.allowed &&
      preflight.reason === 'tpm_limit' &&
      i === targets.length - 1 &&
      typeof preflight.waitMs === 'number' &&
      preflight.waitMs > 0 &&
      preflight.waitMs <= 25_000 &&
      remaining > preflight.waitMs + 5_000 &&
      !request.signal?.aborted
    ) {
      console.warn(`${logPrefix} Waiting ${Math.ceil(preflight.waitMs / 1000)}s for ${target.provider} quota reset (${preflight.detail})`)
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, preflight.waitMs! + 150)
        request.signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
      })
      preflight = checkProviderPreflight({
        provider: target.provider,
        model: target.model,
        estimatedInputTokens: estimatedInput,
        inputCap: target.inputCap,
        completionCap: targetMaxTokens,
      })
    }

    if (!preflight.allowed) {
      const nowIso = new Date().toISOString()
      const category: ErrorCategory =
        preflight.reason === 'disallowed_in_mode'
          ? 'disallowed'
          : preflight.reason === 'input_cap_exceeded'
            ? 'context_limit'
            : 'rate_limit'
      attempts.push({
        provider: target.provider,
        model: target.model,
        attemptIndex: i,
        fallbackUsed: i > 0,
        status: 'skipped',
        error: preflight.detail ?? preflight.reason ?? 'preflight_rejected',
        errorCategory: category,
        statusCode: null,
        usage: null,
        usageKnown: false,
        startedAt: nowIso,
        endedAt: nowIso,
        durationMs: 0,
      })
      lastError = new Error(preflight.reason === 'input_cap_exceeded' ? 'context_limit_exceeded' : 'provider_error_429')
      console.warn(`${logPrefix} Preflight skipped ${target.provider}/${target.model}: ${preflight.detail}`)
      continue
    }

    const resolvedEffort = target.reasoningEffort ?? (
      target.provider === 'groq' && target.model.includes('gpt-oss') && request.reasoningEffort === 'none'
        ? undefined
        : request.reasoningEffort
    )

    const targetRequest: GenerateRequest & { toolCallsResult?: ToolCallRequest[]; usageKnown?: boolean } = {
      ...request,
      messages: targetMessages,
      maxTokens: targetMaxTokens,
      reasoningEffort: resolvedEffort,
      providerTimeoutMs: Math.min(target.timeoutMs ?? 25000, remaining),
    }

    const keyRow: KeyRow = {
      workspace_id: '',
      provider: target.provider,
      model: target.model,
      custom_base_url: target.baseUrl ?? (target.provider === 'dahl' ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1') : null),
      status: 'active',
    }

    const startedMs = Date.now()
    const startedAt = new Date(startedMs).toISOString()
    try {
      const text = await callProvider(keyRow, apiKey, targetRequest)
      const hasToolCalls = Array.isArray(targetRequest.toolCallsResult) && targetRequest.toolCallsResult.length > 0
      // A tool-calling turn may legitimately have empty assistant content.
      if ((!text || !text.trim()) && !hasToolCalls) {
        throw new ProviderCallError('empty_provider_response', 'empty_response', 200, true)
      }

      if (validate && text && !validate(text)) {
        throw new ProviderCallError('invalid_output', 'invalid_output', 200, true)
      }

      const endedMs = Date.now()
      const usageKnown = Boolean(targetRequest.usageKnown)
      attempts.push({
        provider: target.provider,
        model: target.model,
        attemptIndex: i,
        fallbackUsed: i > 0,
        status: 'completed',
        error: null,
        errorCategory: null,
        statusCode: 200,
        usage: usageKnown ? (targetRequest.usage ?? null) : null,
        usageKnown,
        startedAt,
        endedAt: new Date(endedMs).toISOString(),
        durationMs: endedMs - startedMs,
      })

      return {
        text,
        target,
        attemptIndex: i,
        fallbackUsed: i > 0,
        usage: usageKnown ? targetRequest.usage : undefined,
        usageKnown,
        toolCalls: targetRequest.toolCallsResult,
        attempts,
      }
    } catch (err) {
      const endedMs = Date.now()
      const callErr = err instanceof ProviderCallError ? err : null
      const msg = err instanceof Error ? err.message : String(err)
      const isTimeout = err instanceof Error && /Timeout|Abort/.test(err.name)
      const category: ErrorCategory = request.signal?.aborted
        ? 'aborted'
        : callErr?.category ?? (isTimeout ? 'timeout' : 'network_error')
      const statusCode = callErr?.statusCode ?? null
      lastError = err instanceof Error ? err : new Error(msg)
      if (!request.signal?.aborted && (category === 'timeout' || category === 'server_error' || category === 'network_error')) {
        recordProviderOutcome({ provider: target.provider, status: statusCode ?? (category === 'timeout' ? 504 : 500) })
      }

      attempts.push({
        provider: target.provider,
        model: target.model,
        attemptIndex: i,
        fallbackUsed: i > 0,
        status: request.signal?.aborted ? 'aborted' : 'failed',
        error: isTimeout ? 'timeout' : msg,
        errorCategory: category,
        statusCode,
        usage: null,
        usageKnown: false,
        startedAt,
        endedAt: new Date(endedMs).toISOString(),
        durationMs: endedMs - startedMs,
      })

      // Caller aborted or invalid_request (400/422): do not mask with blind fallback.
      if (request.signal?.aborted || (callErr && !callErr.retryable)) {
        break
      }

      const nextTarget = targets[i + 1]
      if (nextTarget) {
        console.warn(`${logPrefix} Target ${target.provider}/${target.model} failed (${category}: ${lastError.message}). Falling back to: ${nextTarget.provider}/${nextTarget.model}`)
      } else {
        console.warn(`${logPrefix} Target ${target.provider}/${target.model} failed (${category}: ${lastError.message}). All fallback options exhausted.`)
      }
    }
  }

  const finalError = lastError ?? new Error('all_targets_failed')
  ;(finalError as { attempts?: ProviderAttemptInfo[] }).attempts = attempts
  throw finalError
}

/**
 * Orchestrator V2: one model turn with native tool-calling. The system prompt is
 * supplied by the caller (the canonical V2 prompt); tools and messages are
 * caller-supplied and validated against the central registry downstream. No task
 * row, no allowance. Uses the managed key, else the workspace's own key.
 */
async function handleOrchestratorV2Request(
  admin: SupabaseClient,
  body: GenerateRequest,
  workspaceId: string,
): Promise<Response> {
  const opConfig = getModelConfigForOperation('orchestrate')
  const request: GenerateRequest = {
    systemPrompt: body.systemPrompt,
    userPrompt: body.userPrompt,
    messages: body.messages,
    tools: body.tools,
    toolChoice: body.toolChoice,
    signal: body.signal,
    jsonMode: false,
    temperature: body.temperature ?? opConfig.temperature ?? 0.2,
    maxTokens: 1400,
    reasoningEffort: 'low',
    providerTimeoutMs: 20000,
  }

  const provider = opConfig.provider || 'groq'
  const model = opConfig.model || 'openai/gpt-oss-120b'
  const managedKey = resolveApiKeyForProvider(provider)
  let key: KeyRow | null = managedKey
    ? { workspace_id: workspaceId, provider, model, custom_base_url: provider === 'dahl' ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1') : (process.env.AI_BASE_URL ?? null), status: 'active' }
    : null
  let plaintextKey: string | null = managedKey

  if (!key || !plaintextKey) {
    const { data: keyMeta } = await admin.from('ai_keys').select('workspace_id, provider, model, custom_base_url, status').eq('workspace_id', workspaceId).maybeSingle()
    if (keyMeta && (keyMeta as KeyRow).status === 'active') {
      key = keyMeta as KeyRow
      plaintextKey = await decryptKey(workspaceId, admin)
    }
  }
  if (!key || !plaintextKey) {
    return new Response(JSON.stringify({ error: 'no_active_key' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  try {
    const result = await executeWithFallback({
      primary: {
        provider,
        model,
        apiKey: plaintextKey,
        baseUrl: provider === 'dahl' ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1') : (process.env.AI_BASE_URL ?? null),
        timeoutMs: 20000,
        inputCap: 3000,
        completionCap: 1400,
      },
      fallbacks: AI_FALLBACK_TEMPLATE,
      request,
      logPrefix: '[orchestrator-v2]',
    })
    const toolCalls = result.toolCalls ?? []
    return new Response(JSON.stringify({
      text: result.text,
      toolCalls,
      usage: result.usage ?? null,
      usageKnown: result.usageKnown,
      provider: result.target.provider,
      model: result.target.model,
      attempt: result.attemptIndex,
      fallbackUsed: result.fallbackUsed,
      attempts: result.attempts,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'generation failed'
    const message = /^(invalid_key|invalid_output|truncated_json_response|unexpected_provider_response|provider_error_\d{3}|context_limit_exceeded|missing_base_url|unapproved_base_url)$/.test(rawMessage) ? rawMessage : 'provider_unavailable'
    const attempts = (err as { attempts?: ProviderAttemptInfo[] }).attempts ?? []
    return new Response(JSON.stringify({ error: message, attempts }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

/**
 * Agent role turn (Director / specialists): supports native OpenAI tool calling
 * (and optional JSON mode) routed via getEmployeeRoleRoute with role caps.
 */
async function handleAgentRoleRequest(
  admin: SupabaseClient,
  body: GenerateRequest,
  workspaceId: string,
): Promise<Response> {
  const role = (body as GenerateRequest & { role?: EmployeeRole }).role
  if (!role || !['director', 'research', 'content', 'marketing_analyst'].includes(role)) {
    return new Response(JSON.stringify({ error: 'invalid_role' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const route = getEmployeeRoleRoute(role)
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0
  const request: GenerateRequest = {
    systemPrompt: body.systemPrompt,
    userPrompt: body.userPrompt,
    messages: body.messages,
    tools: body.tools,
    toolChoice: hasTools ? (body.toolChoice ?? 'auto') : undefined,
    signal: body.signal,
    jsonMode: body.jsonMode ?? false,
    temperature: body.temperature ?? ROLE_TEMPERATURE[role] ?? 0.3,
    maxTokens: Math.min(route.completionCap, 2500),
    reasoningEffort: 'low',
    providerTimeoutMs: 45000,
  }

  const provider = route.primary.provider
  const model = route.primary.model
  const managedKey = resolveApiKeyForProvider(provider)
  let key: KeyRow | null = managedKey
    ? { workspace_id: workspaceId, provider, model, custom_base_url: provider === 'dahl' ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1') : provider === 'sovereigneg' ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1') : (process.env.AI_BASE_URL ?? null), status: 'active' }
    : null
  let plaintextKey: string | null = managedKey
  if (!key || !plaintextKey) {
    const { data: keyMeta } = await admin.from('ai_keys').select('workspace_id, provider, model, custom_base_url, status').eq('workspace_id', workspaceId).maybeSingle()
    if (keyMeta && (keyMeta as KeyRow).status === 'active') { key = keyMeta as KeyRow; plaintextKey = await decryptKey(workspaceId, admin) }
  }
  if (!key || !plaintextKey) {
    return new Response(JSON.stringify({ error: 'no_active_key', attempts: [] }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const fallbacks: ExecutionTarget[] = route.fallbacks.map((fb) => ({
    provider: fb.provider,
    model: fb.model,
    apiKey: resolveApiKeyForProvider(fb.provider),
    baseUrl: fb.provider === 'dahl' ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1') : fb.provider === 'sovereigneg' ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1') : null,
    timeoutMs: fb.timeoutMs ?? (fb.provider === 'groq' ? 25000 : 45000),
    reasoningEffort: fb.reasoningEffort,
    inputCap: fb.provider === 'groq' ? Math.min(route.inputCap, 6500) : route.inputCap,
    completionCap: fb.provider === 'groq' ? Math.min(route.completionCap, 2500) : route.completionCap,
  }))

  try {
    const result = await executeWithFallback({
      primary: {
        provider,
        model,
        apiKey: plaintextKey,
        baseUrl: (key as KeyRow).custom_base_url,
        timeoutMs: provider === 'dahl' ? 45000 : 25000,
        inputCap: route.inputCap,
        completionCap: route.completionCap,
      },
      fallbacks,
      request,
      totalDeadlineMs: 90000,
      logPrefix: `[agent-${role}]`,
    })
    return new Response(JSON.stringify({
      text: result.text,
      toolCalls: result.toolCalls ?? [],
      usage: result.usage ?? null,
      usageKnown: result.usageKnown,
      provider: result.target.provider,
      model: result.target.model,
      attempt: result.attemptIndex,
      fallbackUsed: result.fallbackUsed,
      attempts: result.attempts,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'generation failed'
    const message = /^(invalid_key|invalid_output|truncated_json_response|unexpected_provider_response|provider_error_\d{3}|context_limit_exceeded|missing_base_url|unapproved_base_url)$/.test(rawMessage) ? rawMessage : 'provider_unavailable'
    const attempts = (err as { attempts?: ProviderAttemptInfo[] }).attempts ?? []
    return new Response(JSON.stringify({ error: message, attempts }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

/**
 * Orchestrator decision / Brain answer without a task row.
 * Bounded by the fixed system prompt, a low token cap and a short timeout. It uses
 * the managed model key when present, otherwise the workspace's own (decrypted)
 * key. No allowance is reserved and nothing is written to the task tables.
 */
async function handleOrchestratorRequest(
  admin: SupabaseClient,
  body: GenerateRequest,
  workspaceId: string,
): Promise<Response> {
  const operation = body.operation as 'orchestrate' | 'brain_answer' | 'roadmap' | 'roadmap_answer' | 'roadmap_revision' | 'roadmap_checkin'
  const opConfig = getModelConfigForOperation(operation)
  const jsonMode = ['orchestrate', 'roadmap', 'roadmap_answer', 'roadmap_revision', 'roadmap_checkin'].includes(operation)
  const roadmapTokens = ['roadmap', 'roadmap_revision'].includes(operation) ? 4200 : 0
  const request: GenerateRequest = {
    systemPrompt: body.systemPrompt,
    userPrompt: body.userPrompt,
    signal: body.signal,
    jsonMode,
    temperature: body.temperature ?? opConfig.temperature ?? 0.3,
    maxTokens: roadmapTokens || (jsonMode ? 700 : 900),
    reasoningEffort: opConfig.reasoningEffort ?? 'low',
    providerTimeoutMs: 20000,
  }

  const managedKey = resolveApiKeyForProvider(opConfig.provider || 'groq')
  const provider = opConfig.provider || 'groq'
  const model = opConfig.model || 'openai/gpt-oss-120b'
  let key: KeyRow | null = managedKey && provider && model
    ? {
        workspace_id: workspaceId,
        provider,
        model,
        custom_base_url: provider === 'dahl'
          ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1')
          : provider === 'sovereigneg'
            ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1')
            : (process.env.AI_BASE_URL ?? null),
        status: 'active'
      }
    : null
  let plaintextKey: string | null = managedKey

  if (!key || !plaintextKey) {
    const { data: keyMeta } = await admin
      .from('ai_keys')
      .select('workspace_id, provider, model, custom_base_url, status')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (keyMeta && (keyMeta as KeyRow).status === 'active') {
      key = keyMeta as KeyRow
      plaintextKey = await decryptKey(workspaceId, admin)
    }
  }

  if (!key || !plaintextKey) {
    return new Response(JSON.stringify({ error: 'no_active_key' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await executeWithFallback({
      primary: {
        provider,
        model,
        apiKey: plaintextKey,
        baseUrl: provider === 'dahl'
          ? (process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1')
          : provider === 'sovereigneg'
            ? (process.env.SOVEREIGNEG_BASE_URL || 'https://backend.sovereigneg.com/v1')
            : null,
        timeoutMs: 20000,
      },
      fallbacks: AI_FALLBACK_TEMPLATE,
      request,
      validate: (generated) => validateOutput(operation, generated),
      logPrefix: '[orchestrator]',
    })
    return new Response(JSON.stringify({ text: result.text, usage: result.usage ?? null, provider: result.target.provider, model: result.target.model, attempt: result.attemptIndex, fallbackUsed: result.fallbackUsed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'generation failed'
    const message = /^(invalid_key|invalid_output|truncated_json_response|unexpected_provider_response|provider_error_\d{3}|missing_base_url|unapproved_base_url)$/.test(rawMessage) ? rawMessage : 'provider_unavailable'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
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
  const dahlKey = process.env.DAHL_API_KEY || process.env.AI_DAHL_API_KEY || process.env.AI_CRAWL_API_KEY || null
  const dahlBaseUrl = process.env.DAHL_BASE_URL || 'https://inference.dahl.global/v1'

  // Fallback: Groq API key (formerly AI_API_KEY)
  const fallbackKey = process.env.GROQ_API_KEY || null

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
  body: GenerateRequest & { toolCallsResult?: ToolCallRequest[]; usageKnown?: boolean }
): Promise<string> {
  const isHigh = body.reasoningEffort === 'high'
  const maxTokens = (isHigh && body.maxTokens === undefined) ? undefined : Math.min(Math.max(body.maxTokens ?? 4096, 100), 8000)
  const temperature = Math.min(Math.max(body.temperature ?? 0.7, 0), 1)
  const providerTimeout = Math.min(isHigh ? 60000 : 45000, Math.max(1000, body.providerTimeoutMs ?? (isHigh ? 45000 : 25000)))

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
    recordProviderOutcome({ provider: key.provider, status: res.status, headers: res.headers })
    if (res.status === 401 || res.status === 403) throw new ProviderCallError('invalid_key', 'auth_error', res.status, false)
    if (res.status === 429) throw new ProviderCallError('provider_error_429', 'rate_limit', 429, true)
    if (res.status === 400 || res.status === 422) throw new ProviderCallError(`provider_error_${res.status}`, 'invalid_request', res.status, false)
    if (!res.ok) throw new ProviderCallError(`provider_error_${res.status}`, res.status >= 500 ? 'server_error' : 'network_error', res.status, true)
    const data = await res.json()
    const text = data?.content?.[0]?.text
    if (typeof text !== 'string') throw new ProviderCallError('unexpected_provider_response', 'invalid_output', 200, true)
    if (body.jsonMode && data?.stop_reason === 'max_tokens') throw new ProviderCallError('truncated_json_response', 'invalid_output', 200, true)

    const hasIn = typeof data.usage?.input_tokens === 'number'
    const hasOut = typeof data.usage?.output_tokens === 'number'
    body.usageKnown = hasIn || hasOut
    body.usage = body.usageKnown ? { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens } : undefined
    recordProviderOutcome({ provider: key.provider, status: 200, headers: res.headers, actualTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) })

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
  if (!base) throw new ProviderCallError('missing_base_url', 'invalid_request', null, false)
  if (key.provider === 'custom') {
    const configuredAllowed = (process.env.AI_ALLOWED_BASE_URLS ?? '').split(',').map(x => x.trim()).filter(Boolean)
    const allowed = [...new Set([...configuredAllowed, 'https://inference.dahl.global/v1', 'https://backend.sovereigneg.com/v1'])]
    if (!base.startsWith('https://') || !allowed.includes(base)) throw new ProviderCallError('unapproved_base_url', 'invalid_request', null, false)
  }

  const messages = body.messages && body.messages.length > 0
    ? [...body.messages]
    : [
        ...(body.systemPrompt ? [{ role: 'system', content: body.systemPrompt }] : []),
        { role: 'user', content: body.userPrompt },
      ]
  // Preserve body.systemPrompt when callers pass multi-turn messages without a leading system role.
  if (body.systemPrompt && !messages.some((m) => m.role === 'system')) {
    messages.unshift({ role: 'system', content: body.systemPrompt })
  }
  // OpenAI-compatible json_object mode (notably Groq) rejects requests whose
  // messages never mention "json". Guarantee the keyword is present so a
  // structured turn does not fail with a 400 merely due to prompt wording.
  if (body.jsonMode && !/json/i.test(JSON.stringify(messages))) {
    messages.unshift({ role: 'system', content: 'Respond with a single valid JSON object.' })
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
      messages,
      ...(body.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(body.tools && body.tools.length > 0 ? { tools: body.tools, tool_choice: body.toolChoice ?? 'auto' } : {}),
      ...(body.reasoningEffort && body.reasoningEffort !== 'none' ? {
        reasoning_effort: key.provider === 'groq'
          ? (body.jsonMode && body.reasoningEffort === 'high' ? 'medium' : body.reasoningEffort)
          : body.reasoningEffort,
      } : {}),
    }),
  })
  if (res.status === 401 || res.status === 403) {
    recordProviderOutcome({ provider: key.provider, status: res.status, headers: res.headers })
    throw new ProviderCallError('invalid_key', 'auth_error', res.status, true)
  }
  if (res.status === 429) {
    recordProviderOutcome({ provider: key.provider, status: 429, headers: res.headers })
    throw new ProviderCallError('provider_error_429', 'rate_limit', 429, true)
  }
  if (res.status === 400 || res.status === 422) {
    const errSnippet = (await res.text().catch(() => '')).slice(0, 240)
    if (errSnippet) console.warn(`[ai-generate] ${key.provider} HTTP ${res.status}:`, errSnippet)
    const isToolUseGlitch = /tool_use_failed/i.test(errSnippet)
    throw new ProviderCallError(`provider_error_${res.status}`, isToolUseGlitch ? 'invalid_output' : 'invalid_request', res.status, isToolUseGlitch)
  }
  if (!res.ok) {
    throw new ProviderCallError(`provider_error_${res.status}`, res.status >= 500 ? 'server_error' : 'network_error', res.status, true)
  }
  const data = await res.json()
  const choice = data?.choices?.[0]
  const text = choice?.message?.content
  const hasIn = typeof data.usage?.prompt_tokens === 'number'
  const hasOut = typeof data.usage?.completion_tokens === 'number'
  body.usageKnown = hasIn || hasOut
  body.usage = body.usageKnown ? { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens } : undefined
  recordProviderOutcome({
    provider: key.provider,
    status: 200,
    headers: res.headers,
    actualTokens: body.usageKnown ? ((data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0)) : null,
  })

  // Tool-calling response: content may be null while tool_calls is populated.
  const rawToolCalls = choice?.message?.tool_calls
  if (Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
    const toolCalls: ToolCallRequest[] = rawToolCalls
      .filter((tc: { function?: { name?: unknown; arguments?: unknown } }) => typeof tc?.function?.name === 'string')
      .map((tc: { id?: unknown; function: { name: string; arguments?: unknown } }) => ({
        id: typeof tc.id === 'string' ? tc.id : crypto.randomUUID(),
        name: tc.function.name,
        args: typeof tc.function.arguments === 'string' ? tc.function.arguments : '{}',
      }))
    body.toolCallsResult = toolCalls
    return typeof text === 'string' ? text : ''
  }
  if (typeof text !== 'string') throw new ProviderCallError('unexpected_provider_response', 'invalid_output', 200, true)
  if (body.jsonMode && choice?.finish_reason === 'length') throw new ProviderCallError('truncated_json_response', 'invalid_output', 200, true)

  return text
}