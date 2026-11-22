import { after } from 'next/server'
import { requireApiIdentity, apiError } from '@/server/auth'
import { taskBackend } from '@/server/task-backend'
import { dispatchTasks } from '@/server/task-dispatcher'
import { runOrchestratorRequest } from '@/server/orchestrator/gateway-server'
import { createClient } from '@supabase/supabase-js'
import { publicSupabaseConfig } from '@/lib/supabase-config'
export const maxDuration = 300
export async function POST(request: Request) {
 try {
  const { supabase, user } = await requireApiIdentity(request)
  const text = await request.text()
  if (text.length > 20000) return Response.json({ error: 'Request too large.' }, { status: 413 })
  const body = JSON.parse(text)
  const { data: session } = await supabase.auth.getSession()
  const token = session.session!.access_token
  const { url, key } = publicSupabaseConfig()
  const db = createClient(process.env.SUPABASE_URL || url, key, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } })
  const backend = taskBackend(db, user.id, token)
  let result: unknown
  switch (body.action) {
   case 'refresh': await backend.rpc('recover_tasks', { p_runner_id: null }); result = await backend.list(); break
   // Orchestrator-first: every message runs through the Orchestrator before any task.
   case 'orchestrate':
    if (typeof body.conversationId !== 'string' || !body.conversationId) return Response.json({ error: 'Missing conversation.' }, { status: 400 })
    if (typeof body.request !== 'string' || !body.request.trim() || body.request.length > 12000) return Response.json({ error: 'Enter a message of up to 12,000 characters.' }, { status: 400 })
    if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey) return Response.json({ error: 'Missing request key.' }, { status: 400 })
    result = await runOrchestratorRequest({
     supabase: db,
     workspaceId: user.id,
     token,
     conversationId: body.conversationId,
     request: body.request,
     idempotencyKey: body.idempotencyKey,
     origin: body.origin,
     signal: request.signal,
    })
    break
   case 'submit':
    if (typeof body.request !== 'string' || !body.request.trim() || body.request.length > 12000) return Response.json({ error: 'Enter a request of up to 12,000 characters.' }, { status: 400 })
    result = await backend.rpc('enqueue_task', { p_conversation_id: body.conversationId, p_request: body.request, p_origin: body.origin ?? { kind: 'direct', conversationId: body.conversationId }, p_idempotency_key: body.idempotencyKey }); break
   case 'cancel': result = await backend.rpc('stop_task', { p_task_id: body.id, p_run_id: body.runId, p_status: 'cancelled', p_message: 'Task cancelled. Saved work is retained.' }); break
   case 'resume': result = await backend.rpc('resume_task', { p_task_id: body.id, p_expected_version: body.version }); break
   case 'answer': result = await backend.rpc('answer_task_input', { p_input_id: body.inputId, p_expected_version: body.version, p_answer: body.answer }); break
   default: return Response.json({ error: 'Unknown task action.' }, { status: 400 })
  }
  after(async () => {
   try { await dispatchTasks(backend) }
   catch { /* Persisted leases/checkpoints make interrupted work recoverable. */ }
  })
  return Response.json(result ?? null, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (error) { return apiError(error) }
}