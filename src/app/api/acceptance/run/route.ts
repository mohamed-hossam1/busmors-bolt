import { after } from 'next/server'
import { requireApiIdentity, apiError } from '@/server/auth'
import { createClient } from '@supabase/supabase-js'
import { publicSupabaseConfig } from '@/lib/supabase-config'
import { createTraceCollector } from '@/server/observability'
import { runAcceptanceAgent, type AcceptanceAgent } from '@/server/employee/acceptance-runner'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const ALLOWED: AcceptanceAgent[] = ['director', 'research', 'content', 'marketing_analyst']

/**
 * TEST-MODE-ONLY acceptance runner for individual Employee agents (Director,
 * Research, Content, Marketing Analyst). Gated to AI_MODE=test and disabled in
 * production builds. Runs one real agent against the caller's isolated workspace
 * with the real model/skills/tools and records a real Admin trace. Never publishes
 * or schedules. This route exists solely for authorized acceptance testing.
 */
export async function POST(request: Request) {
 try {
  if (process.env.AI_MODE !== 'test') return Response.json({ error: 'Acceptance runner is disabled outside test mode.' }, { status: 403 })
  const { supabase, user } = await requireApiIdentity(request)
  const text = await request.text()
  if (text.length > 20000) return Response.json({ error: 'Request too large.' }, { status: 413 })
  const body = JSON.parse(text) as { agent?: string; request?: string; intendedOutcome?: string; contextBlock?: string; conversationId?: string | null }
  const agent = body.agent as AcceptanceAgent
  if (!agent || !ALLOWED.includes(agent)) return Response.json({ error: 'Unknown agent.' }, { status: 400 })
  if (typeof body.request !== 'string' || !body.request.trim() || body.request.length > 12000) return Response.json({ error: 'Enter a request of up to 12,000 characters.' }, { status: 400 })

  const { data: session } = await supabase.auth.getSession()
  const token = session.session!.access_token
  const { url, key } = publicSupabaseConfig()
  const db = createClient(process.env.SUPABASE_URL || url, key, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } })

  const trace = createTraceCollector({
    traceId: crypto.randomUUID(),
    workspaceId: user.id,
    userId: user.id,
    conversationId: body.conversationId ?? null,
    idempotencyKey: crypto.randomUUID(),
    request: body.request,
    route: null,
    origin: { kind: 'employee_chat' },
  })
  const startedMs = Date.now()
  const instanceId = crypto.randomUUID()
  trace.recordAgent({ agentId: agent, agentRole: agent, instanceId, label: agent, status: 'running', startedAt: new Date().toISOString(), input: { request: body.request } })

  const result = await runAcceptanceAgent({
    supabase: db,
    workspaceId: user.id,
    token,
    conversationId: body.conversationId ?? null,
    agent,
    request: body.request,
    intendedOutcome: body.intendedOutcome,
    contextBlock: body.contextBlock,
    instanceId,
    signal: request.signal,
    onModel: (info) => {
      const targetInstanceId = info.instanceId ?? instanceId
      trace.recordModel({ provider: info.provider, model: info.model, operation: `${info.role}_model`, attempt: info.attempt, fallbackUsed: info.fallbackUsed, usage: info.usage as { inputTokens?: number; outputTokens?: number }, usageKnown: info.usageKnown, status: info.status, errorCategory: info.errorCategory, startedAt: info.startedAt, endedAt: info.endedAt, error: info.error, input: info.input, outputText: info.outputText, instanceId: targetInstanceId, parentEventId: targetInstanceId })
    },
    onTool: (info) => {
      const targetInstanceId = info.instanceId ?? instanceId
      trace.recordTool({ toolName: info.tool, agentId: info.tool, agentRole: 'tool', operation: info.role, status: info.ok ? 'completed' : 'failed', startedAt: info.startedAt, endedAt: info.endedAt, input: info.input, output: info.output, error: info.error, instanceId: targetInstanceId, parentEventId: targetInstanceId })
    },
    onSkill: (info) => {
      const targetInstanceId = info.instanceId ?? instanceId
      trace.recordSkill({ skillId: info.skillId, role: info.role, version: info.version, contentHash: info.contentHash, status: info.ok ? 'completed' : 'failed', instanceId: targetInstanceId, parentEventId: targetInstanceId })
    },
    onAgent: (info) => trace.recordAgent({ agentId: info.role, agentRole: info.role, instanceId: info.instanceId, parentEventId: info.parentEventId ?? instanceId, label: info.label, status: info.status, startedAt: info.startedAt, endedAt: info.endedAt, input: info.input, output: info.output, error: info.error }),
  })

  trace.recordAgent({ agentId: agent, agentRole: agent, instanceId, label: agent, status: result.status, endedAt: new Date().toISOString(), output: { summary: result.summary, loadedSkills: result.loadedSkills, invokedTools: result.invokedTools, evidenceRefs: result.evidenceRefs, limitations: result.limitations } })
  trace.setResult({ status: result.status, route: null, finalReply: result.summary, durationMs: Date.now() - startedMs })
  const traceId = trace.traceId
  try { after(() => trace.flush()) } catch { void trace.flush() }

  return Response.json({ ...result, traceId: traceId ?? null }, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (error) {
  return apiError(error)
 }
}