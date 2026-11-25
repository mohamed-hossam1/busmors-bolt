import { requireApiIdentity, apiError } from '@/server/auth'
import { evaluateCheckin } from '@/server/roadmap/review'
import type { GeneratedRoadmap } from '@/server/roadmap/generate'

export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface CheckinRequestBody {
  roadmapId?: unknown
  locale?: unknown
  completedSummary?: unknown
  actualResults?: unknown
  whatDidntWork?: unknown
  blockers?: unknown
  businessChanges?: unknown
  nextReviewDays?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 4000) : ''
}

function errorStatus(error: unknown): number {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : ''
  if (message.includes('STALE_VERSION')) return 409
  if (message.includes('ROADMAP_NOT_FOUND') || message.includes('ACTIVE_VERSION_NOT_FOUND')) return 404
  if (message.includes('NOT_AUTHENTICATED')) return 401
  if (message.includes('INVALID_RECOMMENDATION')) return 400
  return 500
}

/**
 * POST /api/roadmap/checkin
 *
 * Evaluates the owner's qualitative progress check-in with the Marketing
 * Director and persists it via save_roadmap_checkin (which also reschedules the
 * next review). Numeric fields are never required: the owner may report purely
 * qualitatively.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => ({}))) as CheckinRequestBody
    const locale = body.locale === 'ar' ? 'ar' : 'en'
    const roadmapId = typeof body.roadmapId === 'string' && UUID_RE.test(body.roadmapId) ? body.roadmapId : null
    if (!roadmapId) {
      return Response.json({ error: 'A valid roadmap id is required.' }, { status: 400 })
    }

    const roadmapRes = await supabase
      .from('roadmaps')
      .select('id,goal,version,review_cadence_days,active_version_id')
      .eq('id', roadmapId)
      .eq('workspace_id', user.id)
      .maybeSingle()
    if (roadmapRes.error) throw roadmapRes.error
    const roadmap = asRecord(roadmapRes.data)
    if (!roadmap.id) {
      return Response.json({ error: 'This roadmap could not be found.' }, { status: 404 })
    }

    const versionRes = await supabase
      .from('roadmap_versions')
      .select('id,summary')
      .eq('roadmap_id', roadmapId)
      .eq('workspace_id', user.id)
      .eq('status', 'active')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (versionRes.error) throw versionRes.error
    const activeVersion = asRecord(versionRes.data)
    const summary = (activeVersion.summary ?? {}) as Partial<GeneratedRoadmap>

    const goal = typeof roadmap.goal === 'string' && roadmap.goal ? roadmap.goal : 'something_else'
    const cadenceDays = typeof roadmap.review_cadence_days === 'number' ? roadmap.review_cadence_days : 7
    const overrideDays = typeof body.nextReviewDays === 'number' && Number.isFinite(body.nextReviewDays) ? Math.trunc(body.nextReviewDays) : null

    const result = await evaluateCheckin({
      workspaceId: user.id,
      locale,
      goal,
      goalLabel: goal,
      expectations: {
        objectiveTitle: summary.primaryObjective?.title ?? '',
        objectiveOutcome: summary.primaryObjective?.outcome ?? '',
        metrics: (summary.metrics ?? []).map((metric) => ({
          name: metric.name,
          currentBaseline: metric.currentBaseline,
          target: metric.target,
        })),
        reviewCadenceDays: cadenceDays,
      },
      completedSummary: text(body.completedSummary),
      actualResults: text(body.actualResults),
      whatDidntWork: text(body.whatDidntWork),
      blockers: text(body.blockers),
      businessChanges: text(body.businessChanges),
    })

    const saved = await supabase.rpc('save_roadmap_checkin', {
      p_roadmap_id: roadmapId,
      p_completed_summary: text(body.completedSummary),
      p_actual_results: text(body.actualResults),
      p_what_didnt_work: text(body.whatDidntWork),
      p_blockers: text(body.blockers),
      p_business_changes: text(body.businessChanges),
      p_recommendation: result.evaluation.recommendation,
      p_assessment: result.evaluation.assessment,
      p_rationale: result.evaluation.rationale,
      p_next_review_days: overrideDays ?? result.evaluation.nextReviewDays,
    })
    if (saved.error) {
      return Response.json({ error: saved.error.message || 'The check-in could not be saved.' }, { status: errorStatus(saved.error) })
    }

    const data = asRecord(saved.data)
    return Response.json({
      evaluation: result.evaluation,
      checkin: data.checkin ?? null,
      roadmap: data.roadmap ?? null,
    })
  } catch (error) {
    return apiError(error)
  }
}