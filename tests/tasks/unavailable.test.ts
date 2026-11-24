import test from 'node:test'
import assert from 'node:assert/strict'
import { executeTask, type TaskBackend } from '../../src/server/task-executor.ts'
import type { ExecutionTask } from '../../src/features/tasks/types.ts'

type Origin = ExecutionTask['origin']

function makeTask(origin: Origin): ExecutionTask {
  return {
    id: 'task-1',
    workspace_id: 'workspace-1',
    conversation_id: 'conversation-1',
    type: 'text',
    status: 'running',
    version: 1,
    origin,
    user_request: 'Do the thing',
    run_id: 'run-1',
    runner_id: 'runner-1',
    result_summary: null,
    attempts: 1,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  }
}

function makeBackend(handlers: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const backend: TaskBackend = {
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      calls.push({ name, args })
      return handlers[name]?.(args) as T
    },
    list: async () => [],
  }
  return { backend, calls }
}

test('a normal task is failed honestly and never marked complete', async () => {
  const { backend, calls } = makeBackend()
  await executeTask(backend, makeTask({ kind: 'document', conversationId: 'conversation-1', deliverableId: 'd1', version: 1 }), new AbortController().signal)

  const stop = calls.find((call) => call.name === 'stop_task')
  assert.ok(stop)
  assert.equal(stop!.args.p_status, 'failed')
  assert.match(String(stop!.args.p_message), /temporarily unavailable/i)
  assert.equal(calls.some((call) => call.name === 'save_task_result'), false)
  assert.equal(calls.some((call) => call.name === 'complete_task'), false)
})

test('a wizard_question task fails the linked research request', async () => {
  const { backend, calls } = makeBackend({
    load_question_research: () => ({ attempts: [{ link: { id: 'link-1', version: 3 } }] }),
  })
  await executeTask(
    backend,
    makeTask({ kind: 'wizard_question', conversationId: 'conversation-1', draftId: 'draft-1', questionId: 'question-1', researchLinkId: 'link-1' }),
    new AbortController().signal,
  )

  const decide = calls.find((call) => call.name === 'decide_question_research')
  assert.ok(decide)
  assert.equal(decide!.args.p_action, 'fail')
  assert.equal(decide!.args.p_link_id, 'link-1')
  assert.equal(decide!.args.p_expected_version, 3)
  assert.equal(calls.some((call) => call.name === 'stop_task'), true)
})

test('a roadmap_step task restores the linked step to a non-running state', async () => {
  const { backend, calls } = makeBackend()
  await executeTask(
    backend,
    makeTask({ kind: 'roadmap_step', conversationId: 'conversation-1', planId: 'plan-1', planVersionId: 'version-1', stepId: 'step-1' }),
    new AbortController().signal,
  )

  const step = calls.find((call) => call.name === 'set_roadmap_step_status')
  assert.ok(step)
  assert.equal(step!.args.p_step_id, 'step-1')
  assert.equal(step!.args.p_status, 'ready')
  assert.equal(calls.some((call) => call.name === 'stop_task'), true)
})