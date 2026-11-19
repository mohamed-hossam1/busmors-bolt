// [functions.ai-generate]
// verify_jwt = true

import { createClient } from 'npm:@supabase/supabase-js@2'
import { OPERATIONS, validateOutput, type Operation } from '../_shared/operations.ts'
import { CRAWL_PROMPTS, type CrawlOperation } from '../_shared/crawl-prompts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface GenerateRequest {
  taskId?: string
  runId?: string
  operation?: Operation
  usage?: { inputTokens?: number; outputTokens?: number }
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
  /** When true, uses the shared business key instead of the caller's own key.
   * Only allowed for onboarding website crawling (extraction of the caller's
   * own submitted site) — the shared key is the business's, not the user's. */
  useSharedCrawlKey?: boolean
  crawlOperation?: CrawlOperation
  providerTimeoutMs?: number
}

interface KeyRow {
  workspace_id: string
  provider: string
  model: string
  custom_base_url: string | null
  status: string
}

async function decryptKey(workspaceId: string, admin: ReturnType<typeof createClient>): Promise<string | null> {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  if (req.method !== 'POST') return new Response(null, { status: 405, headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // verify the caller's JWT and identify their workspace
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const workspaceId = userData.user.id

    const body = (await req.json()) as GenerateRequest
    if (typeof body.userPrompt !== 'string' || !body.userPrompt.trim() || body.userPrompt.length > 50000) {
      return new Response(JSON.stringify({ error: 'missing prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.useSharedCrawlKey === true) {
      return await handleSharedCrawlRequest(admin, body, workspaceId)
    }

    if (!body.operation || !Object.hasOwn(OPERATIONS, body.operation)) {
      return new Response(JSON.stringify({ error: 'invalid_operation', code: 'INVALID_OPERATION' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    body.systemPrompt = OPERATIONS[body.operation]
    body.usage = undefined
    body.jsonMode = !['chat','diagnose','analyze'].includes(body.operation)
    body.maxTokens = Math.min(Math.max(Number.isFinite(body.maxTokens) ? body.maxTokens! : 3500,100), body.operation === 'route' ? 800 : 6000)
    body.providerTimeoutMs = 25000
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
      managedKey = Deno.env.get('AI_API_KEY') ?? null
      const provider = Deno.env.get('AI_PROVIDER'), model = Deno.env.get('AI_MODEL')
      if (managedKey && provider && model) key = { workspace_id: workspaceId, provider, model, custom_base_url: Deno.env.get('AI_BASE_URL') ?? null, status: 'active' }
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
    const tokenLimit=new TextEncoder().encode(body.systemPrompt+body.userPrompt).length+body.maxTokens+256
    const {error:reservationError}=await admin.rpc('reserve_task_call',{p_task_id:task.id,p_run_id:body.runId,p_call_id:callId,p_operation:body.operation,p_token_limit:tokenLimit})
    if(reservationError)return new Response(JSON.stringify({error:reservationError.message.includes('BUDGET_EXHAUSTED')?'budget_exhausted':'run_not_active'}),{status:409,headers:{...corsHeaders,'Content-Type':'application/json'}})
    let succeeded=false
    try {
      const generated=await callProvider(key,plaintextKey,body)
      if(!validateOutput(body.operation,generated))throw new Error('invalid_output')
      succeeded=true
      return new Response(JSON.stringify({text:generated,usage:body.usage??null,callId}),{status:200,headers:{...corsHeaders,'Content-Type':'application/json'}})
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
})

async function handleSharedCrawlRequest(
  admin: ReturnType<typeof createClient>,
  body: GenerateRequest,
  workspaceId: string
): Promise<Response> {
  // Fixed operations own their prompts; caller-controlled prompt fragments are not authorization.
  const operation = body.crawlOperation
  if (operation !== 'extract' && operation !== 'relate') {
    return new Response(JSON.stringify({ error: 'shared_key_not_allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const request: GenerateRequest = {
    systemPrompt: CRAWL_PROMPTS[operation], userPrompt: body.userPrompt,
    jsonMode: true, temperature: 0.1, maxTokens: operation === 'extract' ? 3500 : 1800,
    providerTimeoutMs: 12000,
  }
  const { data: secretRow, error: secretError } = await admin.rpc('read_shared_crawl_key')
  if (secretError || !secretRow) {
    // A personal key is optional; it is read and used entirely on the server.
    const { data: meta } = await admin.from('ai_keys')
      .select('workspace_id, provider, model, custom_base_url, status')
      .eq('workspace_id', workspaceId).maybeSingle()
    if (meta?.status === 'active') {
      const personalKey = await decryptKey(workspaceId, admin)
      if (personalKey) {
        const text = await callProvider(meta as KeyRow, personalKey, request)
        return new Response(JSON.stringify({ text }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }
    return new Response(JSON.stringify({ error: 'shared_key_unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const candidateModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']
  const deadline = Date.now() + 14000
  let lastError: Error | null = null

  for (const model of candidateModels) {
    const remaining = deadline - Date.now()
    if (remaining < 1500) break
    request.providerTimeoutMs = Math.min(10000, remaining)
    const sharedKeyRow: KeyRow = {
      workspace_id: '',
      provider: 'groq',
      model,
      custom_base_url: null,
      status: 'active',
    }
    try {
      const text = await callProvider(sharedKeyRow, String(secretRow), request)
      return new Response(JSON.stringify({ text }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  const message = lastError ? lastError.message : 'generation failed'
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function callProvider(
  key: KeyRow,
  apiKey: string,
  body: GenerateRequest
): Promise<string> {
  const maxTokens = Math.min(Math.max(body.maxTokens ?? 3500, 100), 8000)
  const temperature = Math.min(Math.max(body.temperature ?? 0.7, 0), 1)
  const providerTimeout = Math.min(25000, Math.max(1000, body.providerTimeoutMs ?? 25000))

  if (key.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      signal: AbortSignal.timeout(providerTimeout),
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: key.model,
        max_tokens: Math.min(maxTokens, 4096),
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

  // OpenAI-compatible: openai, groq, google (gemini open-compat), openrouter, custom
  const base =
    key.provider === 'openai'
      ? 'https://api.openai.com/v1'
      : key.provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : key.provider === 'google'
          ? 'https://generativelanguage.googleapis.com/v1beta/openai'
          : key.provider === 'openrouter'
            ? 'https://openrouter.ai/api/v1'
            : (key.custom_base_url ?? '').replace(/\/$/, '')
  if (!base) throw new Error('missing_base_url')
  if (key.provider === 'custom') {
    const allowed = (Deno.env.get('AI_ALLOWED_BASE_URLS') ?? '').split(',').map(x => x.trim()).filter(Boolean)
    if (!base.startsWith('https://') || !allowed.includes(base)) throw new Error('unapproved_base_url')
  }

  const res = await fetch(`${base}/chat/completions`, {
    signal: AbortSignal.timeout(providerTimeout),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: key.model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: body.systemPrompt },
        { role: 'user', content: body.userPrompt },
      ],
      ...(body.jsonMode ? { response_format: { type: 'json_object' } } : {}),
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
