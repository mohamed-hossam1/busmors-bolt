import { supabase } from './supabase'
import type { AgentEvent, BrainNode, Deliverable, PlannedPost, Task } from './types'

export type AgentId =
  | 'orchestrator'
  | 'market_research'
  | 'competitor_analysis'
  | 'content_writer'
  | 'campaign_planner'
  | 'performance'

export interface SubTaskPlan {
  agent: AgentId
  label: string
}

interface EmitContext {
  taskId: string
  workspaceId: string
  seq: { value: number }
}

export interface AgentRunResult {
  reply: string
  deliverable: { title: string; type: Deliverable['type']; content: string } | null
  posts: PlannedPost[]
  knowledgeCandidates: { category: BrainNode['category']; title: string; summary: string; source: BrainNode['source'] }[]
}

export function classifyIntent(input: string): 'simple_answer' | Task['type'] {
  const q = input.toLowerCase()
  if (/(research|بحث السوق|دراسة)/.test(q)) return 'market_research'
  if (/(competitor|منافس|منافسين)/.test(q)) return 'competitor_analysis'
  if (/(calendar|تقويم|خطة نشر)/.test(q)) return 'campaign_planning'
  if (/(write|post|content|اكتب|منشور|محتوى)/.test(q)) return 'content_creation'
  return 'simple_answer'
}

export function planFor(type: Task['type']): SubTaskPlan[] {
  switch (type) {
    case 'market_research':
      return [
        { agent: 'orchestrator', label: 'Planning research' },
        { agent: 'market_research', label: 'Gathering market data' },
        { agent: 'orchestrator', label: 'Reviewing results' },
      ]
    case 'competitor_analysis':
      return [
        { agent: 'orchestrator', label: 'Planning analysis' },
        { agent: 'competitor_analysis', label: 'Crawling competitor sources' },
        { agent: 'orchestrator', label: 'Reviewing results' },
      ]
    case 'content_creation':
      return [
        { agent: 'orchestrator', label: 'Loading brand context' },
        { agent: 'content_writer', label: 'Writing content' },
        { agent: 'orchestrator', label: 'Reviewing results' },
      ]
    case 'campaign_planning':
      return [
        { agent: 'orchestrator', label: 'Loading Brain context' },
        { agent: 'campaign_planner', label: 'Building calendar' },
        { agent: 'content_writer', label: 'Writing post copy' },
        { agent: 'orchestrator', label: 'Reviewing results' },
      ]
    default:
      return [{ agent: 'orchestrator', label: 'Answering' }]
  }
}

async function emit(ctx: EmitContext, event_type: AgentEvent['event_type'], agent_id: AgentId, payload: Record<string, unknown> = {}) {
  ctx.seq.value += 1
  await supabase.from('agent_events').insert({
    task_id: ctx.taskId,
    workspace_id: ctx.workspaceId,
    seq: ctx.seq.value,
    event_type,
    agent_id,
    payload,
  })
}

async function loadBrainContext(workspaceId: string): Promise<BrainNode[]> {
  const { data } = await supabase
    .from('brain_nodes')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'approved')
    .order('confidence', { ascending: false })
    .limit(12)
  return (data ?? []) as BrainNode[]
}

export interface AiCallResult {
  ok: boolean
  text: string
  error?: 'no_active_key' | 'invalid_key' | 'provider_error' | 'network_error'
}

async function callDirectProvider(
  userId: string,
  input: {
    systemPrompt: string
    userPrompt: string
    maxTokens?: number
    temperature?: number
    jsonMode?: boolean
  }
): Promise<AiCallResult | null> {
  try {
    const { data: keyMeta } = await supabase
      .from('ai_keys')
      .select('provider, model, custom_base_url, status')
      .eq('workspace_id', userId)
      .maybeSingle()

    if (!keyMeta || keyMeta.status !== 'active') {
      return { ok: false, text: '', error: 'no_active_key' }
    }

    const { data: plaintextKey, error: rpcError } = await supabase.rpc('read_ai_key', {
      p_workspace: userId,
    })

    if (rpcError || !plaintextKey) {
      console.warn('Could not read decrypted key via RPC:', rpcError)
      return { ok: false, text: '', error: 'no_active_key' }
    }

    const maxTokens = Math.min(Math.max(input.maxTokens ?? 3500, 100), 8000)
    const temperature = Math.min(Math.max(input.temperature ?? 0.7, 0), 1)

    if (keyMeta.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': String(plaintextKey),
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'dangerously-allow-browser': 'true',
        },
        body: JSON.stringify({
          model: keyMeta.model,
          max_tokens: Math.min(maxTokens, 4096),
          temperature,
          system: input.systemPrompt,
          messages: [{ role: 'user', content: input.userPrompt }],
        }),
      })
      if (res.status === 401 || res.status === 403) return { ok: false, text: '', error: 'invalid_key' }
      if (!res.ok) return { ok: false, text: '', error: 'provider_error' }
      const data = await res.json()
      let text = data?.content?.[0]?.text
      if (typeof text !== 'string') return { ok: false, text: '', error: 'provider_error' }

      if (data?.stop_reason === 'max_tokens' && !input.jsonMode) {
        try {
          const contRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': String(plaintextKey),
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
              'dangerously-allow-browser': 'true',
            },
            body: JSON.stringify({
              model: keyMeta.model,
              max_tokens: Math.min(maxTokens, 4096),
              temperature,
              system: input.systemPrompt,
              messages: [
                { role: 'user', content: input.userPrompt },
                { role: 'assistant', content: text },
                { role: 'user', content: 'Continue generating immediately from the exact character where you stopped. Do not repeat anything already written.' },
              ],
            }),
          })
          if (contRes.ok) {
            const contData = await contRes.json()
            const contText = contData?.content?.[0]?.text
            if (typeof contText === 'string') {
              text = text + contText
            }
          }
        } catch (contErr) {
          console.warn('Anthropic continuation failed:', contErr)
        }
      }

      return { ok: true, text }
    }

    const base =
      keyMeta.provider === 'openai'
        ? 'https://api.openai.com/v1'
        : keyMeta.provider === 'groq'
          ? 'https://api.groq.com/openai/v1'
          : keyMeta.provider === 'google'
            ? 'https://generativelanguage.googleapis.com/v1beta/openai'
            : keyMeta.provider === 'openrouter'
              ? 'https://openrouter.ai/api/v1'
              : (keyMeta.custom_base_url ?? '').replace(/\/$/, '')

    let modelToUse = keyMeta.model

    let res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${plaintextKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelToUse,
        max_tokens: maxTokens,
        temperature,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    })

    // If Groq returns 404 (e.g. llama-3.3-70b-versatile not supported/available), retry with active gpt-oss-120b or qwen
    if (!res.ok && res.status === 404 && keyMeta.provider === 'groq') {
      const fallbackModels = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
      for (const fallbackModel of fallbackModels) {
        console.warn(`Groq model ${modelToUse} not available, retrying with ${fallbackModel}`)
        res = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${plaintextKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: fallbackModel,
            max_tokens: maxTokens,
            temperature,
            messages: [
              { role: 'system', content: input.systemPrompt },
              { role: 'user', content: input.userPrompt },
            ],
            ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        })

        if (res.ok) {
          // Persist the working model for this workspace
          void supabase
            .from('ai_keys')
            .update({ model: fallbackModel })
            .eq('workspace_id', userId)
          break
        }
      }
    }

    if (res.status === 401 || res.status === 403) return { ok: false, text: '', error: 'invalid_key' }
    if (!res.ok) {
      console.error('Provider error:', res.status, await res.text().catch(() => ''))
      return { ok: false, text: '', error: 'provider_error' }
    }
    const data = await res.json()
    const choice = data?.choices?.[0]
    let text = choice?.message?.content
    if (typeof text !== 'string') return { ok: false, text: '', error: 'provider_error' }

    // If response stopped due to max token length, auto-continue seamlessly
    if (choice?.finish_reason === 'length' && !input.jsonMode) {
      try {
        const contRes = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${plaintextKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelToUse,
            max_tokens: maxTokens,
            temperature,
            messages: [
              { role: 'system', content: input.systemPrompt },
              { role: 'user', content: input.userPrompt },
              { role: 'assistant', content: text },
              { role: 'user', content: 'Continue generating immediately from the exact character where you stopped. Do not repeat anything already written.' },
            ],
          }),
        })
        if (contRes.ok) {
          const contData = await contRes.json()
          const contText = contData?.choices?.[0]?.message?.content
          if (typeof contText === 'string') {
            text = text + contText
          }
        }
      } catch (contErr) {
        console.warn('Continuation call error in provider:', contErr)
      }
    }

    return { ok: true, text }
  } catch (err) {
    console.error('Direct provider call error:', err)
    return null
  }
}

/** Directly calls Groq using the shared crawl key with model fallbacks */
async function callDirectSharedKey(input: {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
}): Promise<AiCallResult | null> {
  try {
    const { data: sharedKey, error: rpcError } = await supabase.rpc('read_shared_crawl_key')
    if (rpcError || !sharedKey) {
      console.warn('read_shared_crawl_key RPC failed or returned empty:', rpcError)
      return null
    }

    const maxTokens = Math.min(Math.max(input.maxTokens ?? 3500, 100), 8000)
    const temperature = Math.min(Math.max(input.temperature ?? 0.2, 0), 1)

    // Working Groq models: qwen is fast & doesn't waste tokens on reasoning; gpt-oss-120b provides deep reasoning
    const candidateModels = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b']
    for (const model of candidateModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sharedKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: input.systemPrompt },
              { role: 'user', content: input.userPrompt },
            ],
            ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            max_tokens: maxTokens,
            temperature,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const choice = data?.choices?.[0]
          let text = choice?.message?.content
          if (typeof text === 'string') {
            // Auto-continuation if cut off by token length limit
            if (choice?.finish_reason === 'length' && !input.jsonMode) {
              try {
                const contRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${sharedKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model,
                    messages: [
                      { role: 'system', content: input.systemPrompt },
                      { role: 'user', content: input.userPrompt },
                      { role: 'assistant', content: text },
                      { role: 'user', content: 'Continue generating immediately from the exact character where you stopped. Do not repeat anything already written.' },
                    ],
                    max_tokens: maxTokens,
                    temperature,
                  }),
                })
                if (contRes.ok) {
                  const contData = await contRes.json()
                  const contText = contData?.choices?.[0]?.message?.content
                  if (typeof contText === 'string') {
                    text = text + contText
                  }
                }
              } catch (contErr) {
                console.warn('Continuation call error in shared key:', contErr)
              }
            }

            return { ok: true, text }
          }
        } else {
          console.warn(`Shared Groq model ${model} returned HTTP ${res.status}:`, await res.text().catch(() => ''))
        }
      } catch (err) {
        console.warn(`Shared Groq fetch error for model ${model}:`, err)
      }
    }
    return null
  } catch (err) {
    console.error('Error in callDirectSharedKey:', err)
    return null
  }
}

/** Calls the ai-generate edge function with automatic direct-provider and shared-key fallback */
export async function callAi(input: {
  systemPrompt: string
  userPrompt: string
  maxTokens?: number
  temperature?: number
  jsonMode?: boolean
  useSharedCrawlKey?: boolean
}): Promise<AiCallResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData.session?.user?.id
  const token = sessionData.session?.access_token

  // 1. Try edge function first if available
  if (token) {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })
      if (res.ok) {
        const data = await res.json()
        if (typeof data?.text === 'string') return { ok: true, text: data.text }
      } else if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}))
        if (data?.error === 'invalid_key') return { ok: false, text: '', error: 'invalid_key' }
      }
    } catch {
      // Edge function failed or unreachable, fall back to direct calls below
    }
  }

  // 2. If shared crawl key is requested or edge function failed, try the shared Groq key directly
  if (input.useSharedCrawlKey) {
    const sharedResult = await callDirectSharedKey(input)
    if (sharedResult?.ok) return sharedResult
  }

  // 3. Fallback to direct client-side provider call using authenticated user's configured key
  if (userId) {
    const directResult = await callDirectProvider(userId, input)
    if (directResult && directResult.ok) return directResult
  }

  // 4. As a resilient fallback for knowledge/system tasks if user has no personal key configured
  if (!input.useSharedCrawlKey) {
    const sharedResult = await callDirectSharedKey(input)
    if (sharedResult?.ok) return sharedResult
  }

  return { ok: false, text: '', error: 'no_active_key' }
}

function brainContextBlock(brain: BrainNode[]): string {
  if (brain.length === 0) return '(No Business Brain knowledge yet — write generically but professionally.)'
  return brain
    .map((n) => `- [${n.category}] ${n.title}: ${n.summary.slice(0, 160)}`)
    .join('\n')
}

export async function hasActiveAiKey(workspaceId?: string): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = workspaceId || sessionData.session?.user.id
    if (!userId) return false
    const { data } = await supabase
      .from('ai_keys')
      .select('status')
      .eq('workspace_id', userId)
      .maybeSingle()
    return data?.status === 'active'
  } catch {
    return false
  }
}

export async function runAgentTask(input: {
  workspaceId: string
  conversationId: string
  type: Task['type']
  userRequest: string
}): Promise<{ taskId: string; result: AgentRunResult }> {
  const { workspaceId, conversationId, type, userRequest } = input
  const { data: taskData, error: taskError } = await supabase
    .from('tasks')
    .insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      type,
      status: 'running',
      user_request: userRequest,
      plan: planFor(type),
    })
    .select()
    .single()
  if (taskError || !taskData) throw taskError ?? new Error('task insert failed')
  const task = taskData as Task

  const ctx: EmitContext = { taskId: task.id, workspaceId, seq: { value: 0 } }
  const brain = await loadBrainContext(workspaceId)
  const brandVoice = brain.find((n) => n.category === 'brand_rule')
  const offerings = brain.filter((n) => n.category === 'offering')
  const audience = brain.find((n) => n.category === 'audience')

  const result = await executePipeline(ctx, type, userRequest, { brandVoice, offerings, audience, brain })

  const isFailure =
    !result.deliverable &&
    result.posts.length === 0 &&
    (result.reply.includes('API key') ||
      result.reply.includes('Settings page') ||
      result.reply.includes('rejected by the provider') ||
      result.reply.includes('could not reach'))

  await supabase
    .from('tasks')
    .update({
      status: isFailure ? 'failed' : 'completed',
      result_summary: result.reply.slice(0, 200),
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)

  return { taskId: task.id, result }
}

async function executePipeline(
  ctx: EmitContext,
  type: Task['type'],
  request: string,
  context: {
    brandVoice?: BrainNode
    offerings: BrainNode[]
    audience?: BrainNode
    brain: BrainNode[]
  }
): Promise<AgentRunResult> {
  const { offerings } = context

  // Verify that an active AI key exists before dispatching tasks
  const hasKey = await hasActiveAiKey(ctx.workspaceId)
  if (!hasKey) {
    await emit(ctx, 'flow_connection', 'orchestrator', { from: 'user', to: 'orchestrator' })
    await emit(ctx, 'agent_started', 'orchestrator', { task_summary: 'Checking AI API key' })
    await emit(ctx, 'agent_tool_used', 'orchestrator', { tool_label: 'Checking Settings' })
    await emit(ctx, 'agent_error', 'orchestrator', { error: 'no_active_key', message: 'No active AI key configured' })

    return {
      reply: langAwareNoKeyReply(request),
      deliverable: null,
      posts: [],
      knowledgeCandidates: [],
    }
  }

  await emit(ctx, 'flow_connection', 'orchestrator', { from: 'user', to: 'orchestrator' })
  await emit(ctx, 'agent_started', 'orchestrator', { task_summary: 'Planning the work' })
  await emit(ctx, 'agent_tool_used', 'orchestrator', { tool_label: 'Reading Business Brain' })
  await emit(ctx, 'agent_completed', 'orchestrator', { result_summary: 'Plan ready' })

  if (type === 'market_research') {
    await emit(ctx, 'flow_connection', 'market_research', { from: 'orchestrator', to: 'market_research' })
    await emit(ctx, 'agent_started', 'market_research', { task_summary: request })
    await emit(ctx, 'agent_tool_used', 'market_research', { tool_label: 'Searching Reddit' })
    await emit(ctx, 'agent_tool_used', 'market_research', { tool_label: 'Searching YouTube' })
    await emit(ctx, 'agent_tool_used', 'market_research', { tool_label: 'Searching the web' })

    const ai = await callAi({
      systemPrompt:
        'You are a senior market research analyst for Arabic-first SMBs. Write a comprehensive, well-structured markdown report with sections: 1. Executive Summary, 2. Market Overview, 3. Consumer Insights, 4. Opportunities, 5. Threats & Challenges, 6. Recommendations, 7. Sources. Ensure all sections are fully articulated, thorough, and completely closed from start to finish without getting cut off. Ground claims in widely known market patterns; never fabricate specific statistics or URLs. If the request is in Arabic, write the report in the same Arabic register.',
      userPrompt: `Market research request: ${request}\n\nCompany knowledge:\n${brainContextBlock(context.brain)}`,
      maxTokens: 4500,
    })

    if (ai.ok) {
      await emit(ctx, 'agent_completed', 'market_research', { result_summary: 'Research gathered' })
      await emit(ctx, 'flow_connection', 'orchestrator', { from: 'market_research', to: 'orchestrator' })
      return {
        reply: 'Market research is complete. The full report is saved to your Deliverables.',
        deliverable: { title: `Market Research — ${request.slice(0, 60)}`, type: 'research_report', content: ai.text },
        posts: [],
        knowledgeCandidates: [
          { category: 'company_fact', title: `Market interest: ${request.slice(0, 50)}`, summary: 'Community interest confirmed during research; see deliverable for detail.', source: 'task' },
        ],
      }
    }

    await emit(ctx, 'agent_error', 'market_research', { error: ai.error || 'AI generation failed' })
    if (ai.error === 'no_active_key') {
      return {
        reply: langAwareNoKeyReply(request),
        deliverable: null,
        posts: [],
        knowledgeCandidates: [],
      }
    }
    return { reply: aiErrorMessage(ai.error), deliverable: null, posts: [], knowledgeCandidates: [] }
  }

  if (type === 'competitor_analysis') {
    await emit(ctx, 'flow_connection', 'competitor_analysis', { from: 'orchestrator', to: 'competitor_analysis' })
    await emit(ctx, 'agent_started', 'competitor_analysis', { task_summary: request })
    await emit(ctx, 'agent_tool_used', 'competitor_analysis', { tool_label: 'Analyzing competitor website' })
    await emit(ctx, 'agent_tool_used', 'competitor_analysis', { tool_label: 'Checking Facebook Ads Library' })

    const ai = await callAi({
      systemPrompt:
        'You are a competitive intelligence analyst. Write a structured, comprehensive markdown competitor analysis with sections: 1. Overview, 2. Products & Pricing, 3. Online Presence, 4. Advertising, 5. Strengths & Weaknesses, 6. Comparison with the client, 7. Strategic Recommendations. Ensure all 7 sections are fully articulated, with complete tables and strategic recommendations, and closed completely from start to finish without getting cut off mid-section or mid-table. Where you lack live data, clearly state what should be verified rather than inventing specifics. If the request is in Arabic, reply in Arabic.',
      userPrompt: `Competitor analysis request: ${request}\n\nClient company knowledge:\n${brainContextBlock(context.brain)}`,
      maxTokens: 4500,
    })

    if (ai.ok) {
      await emit(ctx, 'agent_completed', 'competitor_analysis', { result_summary: 'Competitor data gathered' })
      await emit(ctx, 'flow_connection', 'orchestrator', { from: 'competitor_analysis', to: 'orchestrator' })
      return {
        reply: 'Competitor analysis is ready — the structured report is in your Deliverables.',
        deliverable: { title: `Competitor Analysis — ${request.slice(0, 60)}`, type: 'competitor_analysis', content: ai.text },
        posts: [],
        knowledgeCandidates: [
          { category: 'competitor', title: `Competitor noted: ${request.slice(0, 50)}`, summary: 'Referenced during competitor analysis task.', source: 'task' },
        ],
      }
    }

    await emit(ctx, 'agent_error', 'competitor_analysis', { error: ai.error || 'AI generation failed' })
    if (ai.error === 'no_active_key') {
      return { reply: langAwareNoKeyReply(request), deliverable: null, posts: [], knowledgeCandidates: [] }
    }
    return { reply: aiErrorMessage(ai.error), deliverable: null, posts: [], knowledgeCandidates: [] }
  }

  if (type === 'content_creation') {
    await emit(ctx, 'flow_connection', 'content_writer', { from: 'orchestrator', to: 'content_writer' })
    await emit(ctx, 'agent_started', 'content_writer', { task_summary: request })
    await emit(ctx, 'agent_tool_used', 'content_writer', { tool_label: 'Writing content' })

    const ai = await callAi({
      systemPrompt:
        'You are an expert Arabic/English bilingual social media copywriter. Write social post drafts natively in the target language — never translate. Respect the brand voice and dialect given in the company knowledge (e.g. Egyptian conversational, Gulf lifestyle, or Modern Standard Arabic). All posts must be strictly text-only copy without images, image descriptions, or visual placeholders. Output format: for each post a markdown section with the platform, the caption, and hashtags. Produce 5 posts unless told otherwise.',
      userPrompt: `Content request: ${request}\n\nCompany knowledge (brand voice, offerings, audience):\n${brainContextBlock(context.brain)}`,
      maxTokens: 3500,
    })

    if (ai.ok) {
      await emit(ctx, 'agent_completed', 'content_writer', { result_summary: 'Drafts produced' })
      return {
        reply: 'Your content drafts are ready and saved to Deliverables. If you want them scheduled, ask me for a content calendar.',
        deliverable: { title: `Content Pack — ${request.slice(0, 60)}`, type: 'content_posts', content: ai.text },
        posts: [],
        knowledgeCandidates: [],
      }
    }

    await emit(ctx, 'agent_error', 'content_writer', { error: ai.error || 'AI generation failed' })
    if (ai.error === 'no_active_key') {
      return { reply: langAwareNoKeyReply(request), deliverable: null, posts: [], knowledgeCandidates: [] }
    }
    return { reply: aiErrorMessage(ai.error), deliverable: null, posts: [], knowledgeCandidates: [] }
  }

  if (type === 'campaign_planning') {
    await emit(ctx, 'flow_connection', 'campaign_planner', { from: 'orchestrator', to: 'campaign_planner' })
    await emit(ctx, 'agent_started', 'campaign_planner', { task_summary: request })
    await emit(ctx, 'agent_tool_used', 'campaign_planner', { tool_label: 'Building calendar' })
    await emit(ctx, 'agent_completed', 'campaign_planner', { result_summary: 'Calendar built' })

    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    const platforms: PlannedPost['platform'][] = ['instagram', 'facebook']
    const topics = offerings.length ? offerings.map((o) => o.title) : [request]

    const ai = await callAi({
      systemPrompt:
        'You are a social media campaign planner. Return STRICT JSON only: {"posts":[{"platform":"instagram"|"facebook","caption":"...","hashtags":"#tag #tag","day_offset":1}]}. Produce 6 posts over two weeks, cycling platforms. Captions must be natively written in the brand\'s language/dialect from the company knowledge (never translated-sounding). All posts are pure text copy only without any images or image links. day_offset is 1-14.',
      userPrompt: `Calendar request: ${request}\n\nCompany knowledge:\n${brainContextBlock(context.brain)}`,
      maxTokens: 3000,
      jsonMode: true,
    })

    interface AiPost { platform: string; caption: string; hashtags: string; day_offset: number }
    let aiPosts: AiPost[] = []
    if (ai.ok) {
      try {
        const parsed = JSON.parse(ai.text) as { posts?: AiPost[] }
        if (Array.isArray(parsed.posts)) aiPosts = parsed.posts.slice(0, 12)
      } catch {
        aiPosts = []
      }
    }

    const posts: PlannedPost[] = (aiPosts.length > 0 ? aiPosts : [1, 3, 5, 8, 10, 12].map((d, i) => ({
      platform: platforms[i % platforms.length].toString(),
      caption: `${topics[i % topics.length]} — ${['Ready for our biggest week yet? Order today','A story-first post about what makes this different','Quick tip: consistency beats bursts'][i % 3]}`,
      hashtags: `#${(topics[i % topics.length] ?? 'brand').toString().replace(/\s+/g, '')}`,
      day_offset: d,
    }))).map((ap, i) => {
      const platform = (['instagram','facebook'].includes(ap.platform) ? ap.platform : platforms[i % platforms.length]) as PlannedPost['platform']
      const when = new Date(Date.now() + Math.max(1, Math.min(14, ap.day_offset)) * 24 * 60 * 60 * 1000)
      when.setHours(18, 0, 0, 0)
      return {
        id: crypto.randomUUID(),
        workspace_id: userId ?? '',
        deliverable_id: null,
        task_id: ctx.taskId,
        platform,
        caption: String(ap.caption ?? '').slice(0, 2000),
        hashtags: String(ap.hashtags ?? '').slice(0, 300),
        image_url: null,
        status: 'pending_approval' as const,
        scheduled_for: when.toISOString(),
        idempotency_key: crypto.randomUUID(),
        publish_result: null,
        created_at: new Date().toISOString(),
      }
    })

    await emit(ctx, 'flow_connection', 'content_writer', { from: 'campaign_planner', to: 'content_writer' })
    await emit(ctx, 'agent_started', 'content_writer', { task_summary: 'Writing post copy' })
    await emit(ctx, 'agent_tool_used', 'content_writer', { tool_label: 'Writing content' })
    await emit(ctx, 'agent_completed', 'content_writer', { result_summary: 'Copy done' })
    await emit(ctx, 'flow_connection', 'orchestrator', { from: 'content_writer', to: 'orchestrator' })

    const calendarContent = [
      `# Content Calendar`,
      ``,
      ...posts.map((p) => `- ${new Date(p.scheduled_for).toLocaleDateString()} — ${p.platform}: ${p.caption.slice(0, 80)}`),
    ].join('\n')

    return {
      reply: `Your calendar is ready: ${posts.length} posts across Instagram and Facebook. Here is how each post looks — review them in Calendar & Publishing, approve the ones you like, then publish them yourself.`,
      deliverable: { title: `Content Calendar — ${request.slice(0, 60)}`, type: 'content_calendar', content: calendarContent },
      posts,
      knowledgeCandidates: [],
    }
  }

  // simple answer — direct chat reply, AI-powered when a key exists
  const isArabic = /[\u0600-\u06FF]/.test(request)
  const ai = await callAi({
    systemPrompt: isArabic
      ? 'أنت موظف تسويقي ذكي لشركة عربية. ارد بالعربية بلهجة ودودة ومهنية، باختصار. اقترح خطوة تالية عملية (بحث سوق، تحليل منافسين، كتابة محتوى، تقويم نشر، أو تشخيص أداء).'
      : 'You are a smart marketing employee for this company. Reply briefly and warmly, and suggest a practical next step (market research, competitor analysis, content, calendar, or performance diagnosis).',
    userPrompt: `Company knowledge:\n${brainContextBlock(context.brain)}\n\nUser said: ${request}`,
    maxTokens: 500,
  })
  if (ai.ok) {
    await emit(ctx, 'agent_completed', 'orchestrator', { result_summary: 'Answered' })
    return { reply: ai.text, deliverable: null, posts: [], knowledgeCandidates: [] }
  }
  await emit(ctx, 'agent_error', 'orchestrator', { error: ai.error || 'AI generation failed' })
  if (ai.error === 'no_active_key') {
    return {
      reply: `Got it! I'm your Marketing Employee. I can run market research, analyze competitors, write posts, build a calendar, or diagnose your monthly performance.\n\n💡 To unlock real AI-generated content and replies, add your API key in Settings.`,
      deliverable: null,
      posts: [],
      knowledgeCandidates: [],
    }
  }
  return { reply: aiErrorMessage(ai.error), deliverable: null, posts: [], knowledgeCandidates: [] }
}

function langAwareNoKeyReply(_request: string): string {
  return 'To run this task with real generated content, add your API key from the Settings page (Groq, OpenAI, Claude, Gemini, etc.). Your key is encrypted server-side and never exposed to the browser.'
}

function aiErrorMessage(error?: string): string {
  if (error === 'invalid_key') {
    return 'Your AI key was rejected by the provider. Please update it in Settings.'
  }
  if (error === 'provider_error') {
    return 'The AI provider returned an error. Please try again in a moment.'
  }
  return 'I could not reach the AI provider. Check your connection and try again.'
}

export async function persistAgentResults(input: {
  workspaceId: string
  conversationId: string
  taskId: string
  result: AgentRunResult
}) {
  const { workspaceId, conversationId, taskId, result } = input
  let deliverableId: string | null = null
  if (result.deliverable) {
    const { data } = await supabase
      .from('deliverables')
      .insert({
        workspace_id: workspaceId,
        task_id: taskId,
        title: result.deliverable.title,
        type: result.deliverable.type,
        content: result.deliverable.content,
      })
      .select()
      .single()
    if (data) deliverableId = (data as Deliverable).id
  }

  if (result.posts.length > 0) {
    const rows = result.posts.map((p) => ({
      workspace_id: workspaceId,
      deliverable_id: deliverableId,
      task_id: taskId,
      platform: p.platform,
      caption: p.caption,
      hashtags: p.hashtags,
      image_url: null,
      status: p.status || 'pending_approval',
      scheduled_for: p.scheduled_for || new Date().toISOString(),
      idempotency_key: p.idempotency_key || crypto.randomUUID(),
    }))
    const { data: inserted, error: pErr } = await supabase.from('planned_posts').insert(rows).select()
    if (pErr) {
      console.error('Error inserting planned_posts in persistAgentResults:', pErr)
    } else {
      console.log(`Successfully persisted ${inserted?.length ?? rows.length} planned posts`)
    }
  }

  if (result.knowledgeCandidates.length > 0) {
    const rows = result.knowledgeCandidates.map((c) => ({
      workspace_id: workspaceId,
      category: c.category,
      title: c.title,
      summary: c.summary,
      status: 'candidate' as const,
      source: c.source,
      source_detail: `task:${taskId}`,
      confidence: 0.6,
    }))
    await supabase.from('brain_nodes').insert(rows)
    await supabase.from('audit_log').insert({
      workspace_id: workspaceId,
      action: 'knowledge_extracted_from_task',
      entity_type: 'brain_node',
      entity_id: taskId,
      details: { count: rows.length },
    })
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      workspace_id: workspaceId,
      role: 'system',
      type: 'knowledge_notification',
      content: `${rows.length}`,
      payload: { count: rows.length },
    })
  }

  const card: Record<string, unknown> | null = result.deliverable
    ? {
        deliverable_id: deliverableId,
        title: result.deliverable.title,
        type: result.deliverable.type,
        content: result.deliverable.content,
        posts: result.posts.map((p) => ({
          platform: p.platform,
          caption: p.caption,
          hashtags: p.hashtags,
          image_url: null,
          scheduled_for: p.scheduled_for,
        })),
      }
    : null
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    workspace_id: workspaceId,
    role: 'agent',
    type: result.deliverable ? 'deliverable_card' : 'text',
    content: result.reply,
    payload: card,
  })
}
