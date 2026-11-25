import { requireApiIdentity, apiError } from '@/server/auth'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface LearningLogRequestBody {
  roadmapId?: unknown
  stepId?: unknown
  hypothesis?: unknown
  experiment?: unknown
  expectedOutcome?: unknown
  actualOutcome?: unknown
  learning?: unknown
  decision?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 4000) : ''
}

function errorStatus(error: unknown): number {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : ''
  if (message.includes('ROADMAP_NOT_FOUND') || message.includes('STEP_NOT_FOUND')) return 404
  if (message.includes('NOT_AUTHENTICATED')) return 401
  if (message.includes('INVALID_LEARNING')) return 400
  return 500
}

/**
 * POST /api/roadmap/learning-log
 *
 * Records a Roadmap-scoped learning (hypothesis, experiment, expected vs actual
 * outcome, learning, decision) via create_learning_log_entry. This is separate
 * from the Business Brain: promoting a durable fact is a distinct, explicit step.
 */
export async function POST(request: Request) {
  try {
    const { supabase } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => ({}))) as LearningLogRequestBody
    const roadmapId = typeof body.roadmapId === 'string' && UUID_RE.test(body.roadmapId) ? body.roadmapId : null
    const stepId = typeof body.stepId === 'string' && UUID_RE.test(body.stepId) ? body.stepId : null
    if (!roadmapId) {
      return Response.json({ error: 'A valid roadmap id is required.' }, { status: 400 })
    }
    const hypothesis = text(body.hypothesis)
    const experiment = text(body.experiment)
    const learning = text(body.learning)
    if (!hypothesis || !experiment || !learning) {
      return Response.json({ error: 'Hypothesis, experiment and learning are required.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('create_learning_log_entry', {
      p_roadmap_id: roadmapId,
      p_step_id: stepId,
      p_hypothesis: hypothesis,
      p_experiment: experiment,
      p_expected_outcome: text(body.expectedOutcome),
      p_actual_outcome: text(body.actualOutcome),
      p_learning: learning,
      p_decision: text(body.decision),
    })
    if (error) {
      return Response.json({ error: error.message || 'The learning could not be saved.' }, { status: errorStatus(error) })
    }

    return Response.json({ entry: asRecord(data) })
  } catch (error) {
    return apiError(error)
  }
}