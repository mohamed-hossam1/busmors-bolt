import 'server-only'
import type { TraceCollector } from './observability'
import type { ExecutionTask } from '../features/tasks/types'

/**
 * Generic task lifecycle only. The retired Employee intelligence is gone: no
 * routing, generation, research, deliverable creation, or question proposals.
 *
 * A claimed task is failed honestly with `capability_unavailable`. It must never
 * call `save_task_result` or `complete_task`, so no fabricated success is stored.
 */
export interface TaskBackend {
  rpc<T>(name: string, args: Record<string, unknown>): Promise<T>
  list(): Promise<ExecutionTask[]>
}

export const CAPABILITY_UNAVAILABLE =
  'Employee intelligence is being rebuilt. This capability is temporarily unavailable.'

type QuestionResearchLoad = {
  attempts?: { link?: { id?: string; version?: number } }[]
}

async function failLinkedQuestion(
  backend: TaskBackend,
  origin: Extract<ExecutionTask['origin'], { kind: 'wizard_question' }>,
): Promise<void> {
  try {
    const loaded = await backend.rpc<QuestionResearchLoad>('load_question_research', {
      p_question_id: origin.questionId,
    })
    const link = loaded.attempts?.find((attempt) => attempt.link?.id === origin.researchLinkId)?.link
    if (link?.id && typeof link.version === 'number') {
      await backend.rpc('decide_question_research', {
        p_link_id: link.id,
        p_expected_version: link.version,
        p_action: 'fail',
        p_note: CAPABILITY_UNAVAILABLE,
      })
    }
  } catch (error) {
    console.error('[task-executor] question research link cleanup failed', error)
  }
}

async function restoreLinkedStep(
  backend: TaskBackend,
  origin: Extract<ExecutionTask['origin'], { kind: 'roadmap_step' }>,
): Promise<void> {
  try {
    await backend.rpc('set_roadmap_step_status', {
      p_step_id: origin.stepId,
      p_status: 'ready',
      p_attestation: { note: CAPABILITY_UNAVAILABLE },
    })
  } catch (error) {
    console.error('[task-executor] roadmap step cleanup failed', error)
  }
}

export async function executeTask(
  backend: TaskBackend,
  task: ExecutionTask,
  signal: AbortSignal,
  trace?: TraceCollector,
): Promise<void> {
  if (task.origin.kind === 'wizard_question') await failLinkedQuestion(backend, task.origin)
  if (task.origin.kind === 'roadmap_step') await restoreLinkedStep(backend, task.origin)

  const message = signal.aborted
    ? 'Execution was interrupted. Employee intelligence is being rebuilt; this capability is temporarily unavailable.'
    : CAPABILITY_UNAVAILABLE

  trace?.setResult({
    status: 'failed',
    route: task.type,
    finalReply: message,
    completedAt: new Date().toISOString(),
  })

  try {
    await backend.rpc('stop_task', {
      p_task_id: task.id,
      p_run_id: task.run_id,
      p_status: 'failed',
      p_message: message,
    })
  } catch (error) {
    // The lease may have expired or another worker finished the task first.
    console.error('[task-executor] fail-fast stop_task failed', error)
  }
}