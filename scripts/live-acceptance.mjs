// Live acceptance harness (isolated local DB + real model calls).
// Creates a fresh isolated user/workspace, seeds approved Brain facts, creates a
// conversation, calls the real /api/tasks orchestrate endpoint, then inspects the
// Admin trace via the service-role client. Prints redacted evidence + PASS/FAIL.
//
// Usage: node --env-file=.env scripts/live-acceptance.mjs <scenario>
// One live model execution per invocation. Never prints secrets.

import { createClient } from '@supabase/supabase-js'

const BASE = process.env.LIVE_BASE_URL || 'http://127.0.0.1:4180'
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

const scenario = process.argv[2] || 'A1'

function redact(s) {
  return String(s ?? '').replace(/sk-[A-Za-z0-9_-]{6,}/g, '[REDACTED]').slice(0, 500)
}

async function main() {
  const admin = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } })
  const email = `live-${scenario}-${Date.now()}@example.com`
  const password = 'Live!test-' + Math.random().toString(36).slice(2) + '-A9'
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createErr || !created.user) throw new Error('createUser: ' + (createErr?.message || 'no user'))
  const userId = created.user.id

  const user = createClient(SUPA_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: signIn, error: signErr } = await user.auth.signInWithPassword({ email, password })
  if (signErr || !signIn.session) throw new Error('signIn: ' + (signErr?.message || 'no session'))
  const token = signIn.session.access_token
  // Build the @supabase/ssr auth cookie so the cookie-based server API authenticates.
  const cookieName = 'sb-' + new URL(SUPA_URL).hostname.split('.')[0] + '-auth-token'
  const sessionJson = JSON.stringify({ access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token, expires_at: signIn.session.expires_at, expires_in: signIn.session.expires_in, token_type: signIn.session.token_type, user: signIn.user })
  const cookie = `${cookieName}=base64-${Buffer.from(sessionJson).toString('base64')}`

  // Bootstrap workspace (RLS-scoped).
  const { data: ws, error: wsErr } = await user.rpc('bootstrap_workspace')
  if (wsErr) throw new Error('bootstrap: ' + wsErr.message)

  // Seed approved Brain facts for this workspace (service role).
  const facts = [
    { category: 'offering', title: 'Signature Coffee', summary: '250g bag of Egyptian specialty coffee at EGP 220.', verification_state: 'owner_reported' },
    { category: 'audience', title: 'Target Audience', summary: 'Urban Egyptian coffee lovers in Greater Cairo aged 25-40.', verification_state: 'owner_reported' },
    { category: 'brand_rule', title: 'Brand Voice', summary: 'Warm, modern, professional Egyptian Arabic.', verification_state: 'owner_reported' },
  ]
  const { error: seedErr } = await admin.from('brain_nodes').insert(facts.map((f) => ({ workspace_id: userId, status: 'approved', approval_state: 'approved', is_current: true, ...f })))
  if (seedErr) throw new Error('seed brain: ' + seedErr.message)

  // Create a conversation.
  const { data: conv, error: convErr } = await user.from('conversations').insert({ workspace_id: userId, title: 'New Chat' }).select('id').single()
  if (convErr || !conv) throw new Error('conversation: ' + (convErr?.message || 'none'))
  const conversationId = conv.id

  const request = process.env.LIVE_REQUEST || 'What is the price of our signature coffee?'
  const idem = crypto.randomUUID()

  const started = Date.now()
  const res = await fetch(`${BASE}/api/tasks`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'orchestrate', conversationId, request, idempotencyKey: idem }),
  })
  const body = await res.json().catch(() => ({}))
  const elapsed = Date.now() - started

  // The admin trace flushes in after() (post-response); give it a moment.
  await new Promise((r) => setTimeout(r, 2000))

  // Inspect the admin trace via service role.
  const { data: traces } = await admin.from('admin_trace_list').select('id, status, route, request, final_reply, model_call_count, tool_call_count, agent_count, llm_total_tokens, started_at, completed_at').eq('conversation_id', conversationId).order('started_at', { ascending: false }).limit(1)
  const trace = traces?.[0]
  let events = []
  if (trace) {
    const { data: ev } = await admin.from('admin_trace_events').select('seq, event_type, agent_id, agent_role, tool_name, operation, provider, model, status, llm_input_tokens, llm_output_tokens, metadata, instance_id, parent_event_id, error').eq('trace_id', trace.id).order('seq', { ascending: true })
    events = ev || []
  }

  const out = {
    scenario,
    httpStatus: res.status,
    elapsedMs: elapsed,
    outcome: body.outcome,
    path: body.path,
    reply: redact(body.reply),
    trace: trace ? { id: trace.id, status: trace.status, route: trace.route, model_calls: trace.model_call_count, tool_calls: trace.tool_call_count, agents: trace.agent_count, tokens: trace.llm_total_tokens } : null,
    events: events.map((e) => ({ seq: e.seq, type: e.event_type, agent: e.agent_id, role: e.agent_role, tool: e.tool_name, op: e.operation, provider: e.provider, model: e.model, status: e.status, in: e.llm_input_tokens, out: e.llm_output_tokens, usageStatus: e.metadata?.usageStatus, skill: e.metadata?.skillId, instance: e.instance_id, parent: e.parent_event_id, error: e.error })),
    messages: (await user.from('messages').select('role, type, content').eq('conversation_id', conversationId).order('created_at', { ascending: true })).data?.map((m) => ({ role: m.role, type: m.type, content: redact(m.content) })),
    brainCount: (await admin.from('brain_nodes').select('id', { count: 'exact', head: true }).eq('workspace_id', userId)).count,
    proposals: (await admin.from('brain_proposals').select('id, status, diff').eq('workspace_id', userId)).data?.map((p) => ({ id: p.id, status: p.status, title: p.diff?.title })),
    deliverables: (await admin.from('deliverables').select('id, title, type, version').eq('workspace_id', userId)).data,
    drafts: (await admin.from('planned_posts').select('id, platform, status, proposed_for, scheduled_for').eq('workspace_id', userId)).data,
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(1) })