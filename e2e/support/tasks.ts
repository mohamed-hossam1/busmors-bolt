import { expect, type Page } from 'playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { poll } from './poll'
import { waitForHydration } from './browser'

export interface StoredTask {
  id: string
  type: string
  status: string
  user_request: string
  checkpoint: Record<string, unknown>
  result_summary: string | null
  conversation_id: string
}

export async function submitTask(page: Page, client: SupabaseClient, request: string): Promise<StoredTask> {
  await waitForHydration(page)
  const composer = page.getByLabel('Message your Marketing Director')
  await expect(composer).toBeEnabled({ timeout: 30_000 })
  await composer.fill(request)
  await page.getByRole('button', { name: 'Send message' }).click()

  const task = await poll(async () => {
    const response = await client.from('tasks').select('*').eq('user_request', request).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (response.error) throw new Error(`Task read failed: ${response.error.message}`)
    return response.data as StoredTask | null
  }, value => Boolean(value), 30_000)
  if (!task) throw new Error('The submitted request was not persisted as a task.')

  return await poll(async () => {
    const response = await client.from('tasks').select('*').eq('id', task.id).single()
    if (response.error) throw new Error(`Task progress read failed: ${response.error.message}`)
    return response.data as StoredTask
  }, value => ['completed', 'partial', 'failed', 'interrupted', 'cancelled', 'awaiting_input'].includes(value.status), 120_000, 1_500)
}

export async function taskEvidence(client: SupabaseClient, taskId: string) {
  const [steps, events, result, messages, posts, deliverables, usage] = await Promise.all([
    client.from('task_steps').select('*').eq('task_id', taskId).order('position'),
    client.from('agent_events').select('*').eq('task_id', taskId).order('seq'),
    client.from('task_results').select('*').eq('task_id', taskId).maybeSingle(),
    client.from('messages').select('*').contains('payload', { taskId }).order('created_at'),
    client.from('planned_posts').select('*').eq('task_id', taskId).order('created_at'),
    client.from('deliverables').select('*').eq('task_id', taskId).order('created_at'),
    client.from('task_usage').select('*').eq('task_id', taskId).order('created_at'),
  ])
  for (const response of [steps, events, result, messages, posts, deliverables, usage]) {
    if (response.error) throw new Error(`Task evidence read failed: ${response.error.message}`)
  }
  return {
    steps: steps.data ?? [], events: events.data ?? [], result: result.data,
    messages: messages.data ?? [], posts: posts.data ?? [], deliverables: deliverables.data ?? [], usage: usage.data ?? [],
  }
}
