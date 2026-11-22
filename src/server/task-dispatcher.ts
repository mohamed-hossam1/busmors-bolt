import 'server-only'
import { executeTask, type TaskBackend } from './task-executor'
import type { ExecutionTask } from '../features/tasks/types'
export async function dispatchTasks(backend: TaskBackend, budgetMs = 300000) {
 const deadline = Date.now() + budgetMs
 while (Date.now() < deadline) {
  // Publishing runs through its own reconciliation path (C26), never the generic runner.
  const queued = (await backend.list()).filter(task => task.status === 'queued' && (task.type as string) !== 'publishing').sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (!queued.length) return
  // Research shares one workspace allowance, so it runs alone; other intents stay parallel.
  const research = queued.filter(task => task.type === 'marketing_research')
  const batch = research.length ? research.slice(0, 1) : queued.slice(0, 2)
  let admitted = 0
  await Promise.all(batch.map(async candidate => {
   const task = await backend.rpc<ExecutionTask | null>('admit_task', { p_task_id: candidate.id, p_runner_id: crypto.randomUUID() })
   if (!task) return
   admitted++
   const controller = new AbortController()
   const timeout = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()))
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
   try { await executeTask(backend, task, controller.signal) }
   finally { clearTimeout(timeout); clearInterval(heartbeat) }
  }))
  if (!admitted) return
 }
}
