// [functions.ai-generate]
// verify_jwt = true

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
}

interface GenerateRequest {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
  /** When true, uses the shared business key instead of the caller's own key.
   * Only allowed for onboarding website crawling (extraction of the caller's
   * own submitted site) — the shared key is the business's, not the user's. */
  useSharedCrawlKey?: boolean
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
    if (!body.systemPrompt || !body.userPrompt) {
      return new Response(JSON.stringify({ error: 'missing prompt' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.useSharedCrawlKey === true) {
      return await handleSharedCrawlRequest(admin, body)
    }

    const { data: keyMeta } = await admin
      .from('ai_keys')
      .select('workspace_id, provider, model, custom_base_url, status')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    const key = (keyMeta as KeyRow | null) ?? null

    if (!key || key.status !== 'active') {
      return new Response(JSON.stringify({ error: 'no_active_key' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const plaintextKey = await decryptKey(workspaceId, admin)
    if (!plaintextKey) {
      return new Response(JSON.stringify({ error: 'no_active_key' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const generated = await callProvider(key, plaintextKey, body)

    return new Response(JSON.stringify({ text: generated }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generation failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function handleSharedCrawlRequest(
  admin: ReturnType<typeof createClient>,
  body: GenerateRequest
): Promise<Response> {
  // only crawl extraction & relationship mapping prompts may use the shared key
  const isAllowedPrompt =
    body.systemPrompt.includes('extract structured business knowledge') ||
    body.systemPrompt.includes('business knowledge analyst') ||
    body.systemPrompt.includes('relationships between pieces of company knowledge') ||
    body.systemPrompt.includes('map relationships')

  if (!isAllowedPrompt) {
    return new Response(JSON.stringify({ error: 'shared_key_not_allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const { data: secretRow, error: secretError } = await admin.rpc('read_shared_crawl_key')
  if (secretError || !secretRow) {
    return new Response(JSON.stringify({ error: 'shared_key_unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const candidateModels = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
  let lastError: Error | null = null

  for (const model of candidateModels) {
    const sharedKeyRow: KeyRow = {
      workspace_id: '',
      provider: 'groq',
      model,
      custom_base_url: null,
      status: 'active',
    }
    try {
      const text = await callProvider(sharedKeyRow, String(secretRow), body)
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

  if (key.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
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
    let text = data?.content?.[0]?.text
    if (typeof text !== 'string') throw new Error('unexpected_provider_response')

    if (data?.stop_reason === 'max_tokens' && !body.jsonMode) {
      try {
        const contRes = await fetch('https://api.anthropic.com/v1/messages', {
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
            messages: [
              { role: 'user', content: body.userPrompt },
              { role: 'assistant', content: text },
              { role: 'user', content: 'Continue generating immediately from the exact character where you stopped. Do not repeat anything already written.' },
            ],
          }),
        })
        if (contRes.ok) {
          const contData = await contRes.json()
          const contText = contData?.content?.[0]?.text
          if (typeof contText === 'string') text = text + contText
        }
      } catch {
        // continue with partial text
      }
    }

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

  const res = await fetch(`${base}/chat/completions`, {
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
  let text = choice?.message?.content
  if (typeof text !== 'string') throw new Error('unexpected_provider_response')

  if (choice?.finish_reason === 'length' && !body.jsonMode) {
    try {
      const contRes = await fetch(`${base}/chat/completions`, {
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
            { role: 'assistant', content: text },
            { role: 'user', content: 'Continue generating immediately from the exact character where you stopped. Do not repeat anything already written.' },
          ],
        }),
      })
      if (contRes.ok) {
        const contData = await contRes.json()
        const contText = contData?.choices?.[0]?.message?.content
        if (typeof contText === 'string') text = text + contText
      }
    } catch {
      // continue with partial text
    }
  }

  return text
}
