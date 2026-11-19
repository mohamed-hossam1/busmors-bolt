import type { ExecutionTask } from './types'
import type { TaskOrigin } from '../../lib/contracts'
/** UI coordinator only. Work runs in Next.js; persisted leases arbitrate concurrency. */
export class TaskClient {
 tasks: ExecutionTask[] = []
 error = ''
 private listeners = new Set<() => void>()
 private timer: ReturnType<typeof setInterval> | undefined
 private stopped = false
 private refreshing = false
 subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
 private notify() { for (const listener of this.listeners) listener() }
 private async request<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...args }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Task request failed. Please retry.')
  return data as T
 }
 async start() { await this.refresh(); if (!this.stopped) this.timer = setInterval(() => void this.refresh(), 2500) }
 stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.listeners.clear() }
 async refresh() {
  if (this.stopped || this.refreshing) return
  this.refreshing = true
  try { const tasks = await this.request<ExecutionTask[]>('refresh'); if (!this.stopped) { this.tasks = tasks; this.error = ''; this.notify() } }
  catch { if (!this.stopped) { this.error = 'Task progress could not be refreshed. Your saved work is kept.'; this.notify() } }
  finally { this.refreshing = false }
 }
 async submit(conversationId: string, request: string, idempotencyKey: string, origin?: TaskOrigin) {
  const task = await this.request<ExecutionTask>('submit', { conversationId, request, idempotencyKey, origin })
  await this.refresh(); return task
 }
 async cancel(task: ExecutionTask) { await this.request('cancel', { id: task.id, runId: task.run_id }); await this.refresh() }
 async resume(task: ExecutionTask) { await this.request('resume', { id: task.id, version: task.version }); await this.refresh() }
 async answer(inputId: string, version: number, answer: { status: string; value?: string }) { await this.request('answer', { inputId, version, answer }); await this.refresh() }
}
