import 'server-only'
import { executeTask, type TaskBackend } from './task-executor'
import { createTraceCollector } from './observability'
import type { ExecutionTask } from '../features/tasks/types'
export async function dispatchTasks(backend: TaskBackend, budgetMs = 300000) {
 const deadline = Date.now() + budgetMs
 while (Date.now() < deadline) {
  // Publishing runs through its own reconciliation path (C26), never the generic runner.
  const queued = (await backend.list()).filter(task => task.status === 'queued' && (task.type as string) !== 'publishing').sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (!queued.length) return
  const batch = queued.slice(0, 2)
  let admitted = 0
  await Promise.all(batch.map(async candidate => {
   const task = await backend.rpc<ExecutionTask | null>('admit_task', { p_task_id: candidate.id, p_runner_id: crypto.randomUUID() })
   if (!task) return
   admitted++
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()))
    // Each dispatched attempt continues the same admin trace when one exists.
    const trace = task.trace_id
      ? createTraceCollector({ traceId: task.trace_id, workspaceId: task.workspace_id, userId: task.workspace_id, conversationId: task.conversation_id, request: task.user_request, route: task.type })
      : null
    trace?.setRun(task.run_id, task.attempts)
    let checking = false
   const heartbeat = setInterval(async () => {
    if (checking) return
    checking = true
    try {
     const current = (await backend.list()).find(row => row.id === task.id)
     if (!current || current.status !== 'running' || current.run_id !== task.run_id) controller.abort()
     else await backend.rpc('heartbeat_task', { p_task_id: task.id, p_run_id: task.run_id })
    } catch { controller.abort() }
    finally { checking = false }
   }, 5000)
    try { await executeTask(backend, task, controller.signal, trace ?? undefined) }
    finally { clearTimeout(timeout); clearInterval(heartbeat); if (trace) await trace.flush() }
  }))
  if (!admitted) return
 }
}
