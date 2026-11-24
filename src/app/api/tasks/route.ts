import { after } from 'next/server'
import { requireApiIdentity, apiError } from '@/server/auth'
import { dispatchTasks } from '@/server/task-dispatcher'
import type { TaskBackend } from '@/server/task-executor'
import type { ExecutionTask } from '@/features/tasks/types'
import { runOrchestratorV2Request } from '@/server/orchestrator/gateway-server-v2'
import { createClient } from '@supabase/supabase-js'
import { publicSupabaseConfig } from '@/lib/supabase-config'

export const maxDuration = 300

const TASK_EXECUTION_UNAVAILABLE = 'Task execution is temporarily unavailable while Employee intelligence is rebuilt.'

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

  const backend: TaskBackend = {
   async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db.rpc(name, args)
    if (error) throw error
    return data as T
   },
   async list() {
    // History is bounded; unfinished work cannot disappear behind that limit.
    const { data, error } = await db.from('tasks').select('*').eq('workspace_id', user.id).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    const tasks = new Map((data ?? []).map(task => [task.id, task as ExecutionTask]))
    for (let offset = 0; ; offset += 200) {
     const page = await db.from('tasks').select('*').eq('workspace_id', user.id)
      .in('status', ['queued', 'running', 'awaiting_input', 'awaiting_approval']).order('created_at').order('id').range(offset, offset + 199)
     if (page.error) throw page.error
     for (const task of page.data ?? []) tasks.set(task.id, task as ExecutionTask)
     if ((page.data?.length ?? 0) < 200) break
    }
    return [...tasks.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
   },
  }

  let result: unknown
  switch (body.action) {
   case 'refresh': await backend.rpc('recover_tasks', { p_runner_id: null }); result = await backend.list(); break
   // Orchestrator-first: every message runs through the Orchestrator. Task requests
   // receive an honest unavailability reply; no task is ever enqueued.
   case 'orchestrate':
    if (typeof body.conversationId !== 'string' || !body.conversationId) return Response.json({ error: 'Missing conversation.' }, { status: 400 })
    if (typeof body.request !== 'string' || !body.request.trim() || body.request.length > 12000) return Response.json({ error: 'Enter a message of up to 12,000 characters.' }, { status: 400 })
    if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey) return Response.json({ error: 'Missing request key.' }, { status: 400 })
    result = await runOrchestratorV2Request({
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
   // Direct task submission, resume, and input answering are disabled. The generic
   // lifecycle remains for historical reads and cancellation.
   case 'submit':
   case 'resume':
   case 'answer':
    return Response.json({ error: TASK_EXECUTION_UNAVAILABLE, code: 'TASK_EXECUTION_UNAVAILABLE' }, { status: 409 })
   case 'cancel': result = await backend.rpc('stop_task', { p_task_id: body.id, p_run_id: body.runId, p_status: 'cancelled', p_message: 'Task cancelled. Saved work is retained.' }); break
   default: return Response.json({ error: 'Unknown task action.' }, { status: 400 })
  }
  after(async () => {
   try { await dispatchTasks(backend) }
   catch { /* Persisted leases/checkpoints make interrupted work recoverable. */ }
  })
  return Response.json(result ?? null, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (error) { return apiError(error) }
}