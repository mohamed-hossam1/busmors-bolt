// Live acceptance harness for individual Employee agents (test mode only).
// Creates a fresh isolated user/workspace, seeds approved Brain facts, calls the
// test-gated /api/acceptance/run route with one real agent, then inspects the
// Admin trace via the service-role client. Prints redacted evidence.
//
// Usage: node --env-file=.env scripts/live-agent.mjs <agent> "<request>" ["<intendedOutcome>"]
// One live agent execution per invocation. Never prints secrets.

import { createClient } from '@supabase/supabase-js'

const BASE = process.env.LIVE_BASE_URL || 'http://127.0.0.1:4180'
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

const agent = process.argv[2] || 'director'
const request = process.argv[3] || 'Recommend a practical short campaign strategy for our coffee business.'
const intendedOutcome = process.argv[4] || ''

function redact(s) {
  return String(s ?? '').replace(/sk-[A-Za-z0-9_-]{6,}/g, '[REDACTED]').slice(0, 4000)
}

async function main() {
  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } })
  const tag = `${agent}-${Date.now()}`
  const email = `live-${tag}@example.com`
  const password = 'Live!test-' + Math.random().toString(36).slice(2) + '-A9'
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createErr || !created.user) throw new Error('createUser: ' + (createErr?.message || 'no user'))
  const userId = created.user.id

  const user = createClient(SUPA_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signIn, error: signErr } = await user.auth.signInWithPassword({ email, password })
  if (signErr || !signIn.session) throw new Error('signIn: ' + (signErr?.message || 'no session'))
  const token = signIn.session.access_token
  const cookieName = 'sb-' + new URL(SUPA_URL).hostname.split('.')[0] + '-auth-token'
  const sessionJson = JSON.stringify({ access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token, expires_at: signIn.session.expires_at, expires_in: signIn.session.expires_in, token_type: signIn.session.token_type, user: signIn.user })
  const cookie = `${cookieName}=base64-${Buffer.from(sessionJson).toString('base64')}`

  const { error: wsErr } = await user.rpc('bootstrap_workspace')
  if (wsErr) throw new Error('bootstrap: ' + wsErr.message)

  const facts = [
    { category: 'offering', title: 'Signature Coffee', summary: '250g bag of Egyptian specialty coffee at EGP 220.', verification_state: 'owner_reported' },
    { category: 'audience', title: 'Target Audience', summary: 'Urban Egyptian coffee lovers in Greater Cairo aged 25-40.', verification_state: 'owner_reported' },
    { category: 'brand_rule', title: 'Brand Voice', summary: 'Warm, modern, professional Egyptian Arabic.', verification_state: 'owner_reported' },
  ]
  const { error: seedErr } = await admin.from('brain_nodes').insert(facts.map((f) => ({ workspace_id: userId, status: 'approved', approval_state: 'approved', is_current: true, ...f })))
  if (seedErr) throw new Error('seed brain: ' + seedErr.message)

  const started = Date.now()
  const res = await fetch(`${BASE}/api/acceptance/run`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ agent, request, intendedOutcome: intendedOutcome || undefined }),
  })
  const body = await res.json().catch(() => ({}))
  const elapsed = Date.now() - started

  await new Promise((r) => setTimeout(r, 2500))

  const traceId = body.traceId
  let events = []
  let trace = null
  if (traceId) {
    const { data: t } = await admin.from('admin_trace_list').select('id, status, model_call_count, tool_call_count, agent_count, llm_total_tokens, llm_input_tokens, llm_output_tokens').eq('id', traceId).maybeSingle()
    trace = t
    const { data: ev } = await admin.from('admin_trace_events').select('seq, event_type, agent_id, agent_role, tool_name, operation, provider, model, status, llm_input_tokens, llm_output_tokens, metadata, instance_id, parent_event_id, error').eq('trace_id', traceId).order('seq', { ascending: true })
    events = ev || []
  }

  const out = {
    agent,
    httpStatus: res.status,
    elapsedMs: elapsed,
    status: body.status,
    summary: redact(body.summary),
    loadedSkills: body.loadedSkills,
    invokedTools: body.invokedTools,
    evidenceRefs: body.evidenceRefs,
    limitations: body.limitations,
    specialistResults: body.specialistResults,
    error: body.error,
    trace: trace ? { id: trace.id, status: trace.status, model_calls: trace.model_call_count, tool_calls: trace.tool_call_count, agents: trace.agent_count, tokens: trace.llm_total_tokens, in: trace.llm_input_tokens, out: trace.llm_output_tokens } : null,
    events: events.map((e) => ({ seq: e.seq, type: e.event_type, agent: e.agent_id, role: e.agent_role, tool: e.tool_name, op: e.operation, provider: e.provider, model: e.model, status: e.status, in: e.llm_input_tokens, out: e.llm_output_tokens, usageStatus: e.metadata?.usageStatus, skill: e.metadata?.skillId, instance: e.instance_id, parent: e.parent_event_id, error: e.error })),
    deliverables: (await admin.from('deliverables').select('id, title, type, version').eq('workspace_id', userId)).data,
    drafts: (await admin.from('planned_posts').select('id, platform, status, proposed_for, scheduled_for').eq('workspace_id', userId)).data,
    proposals: (await admin.from('brain_proposals').select('id, status, diff').eq('workspace_id', userId)).data?.map((p) => ({ id: p.id, status: p.status, title: p.diff?.title })),
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(1) })