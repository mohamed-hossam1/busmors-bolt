import { requireApiIdentity, apiError } from '@/server/auth'
import { buildRoadmapPersistencePayload, type GeneratedRoadmap } from '@/server/roadmap/generate'
import { proposeRoadmapRevision } from '@/server/roadmap/revise'

export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface RevisionsRequestBody {
  roadmapId?: unknown
  locale?: unknown
  ownerRequest?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function errorStatus(error: unknown): number {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : ''
  if (message.includes('STALE_VERSION')) return 409
  if (message.includes('ROADMAP_NOT_FOUND') || message.includes('ACTIVE_VERSION_NOT_FOUND')) return 404
  if (message.includes('NOT_AUTHENTICATED')) return 401
  return 500
}

/**
 * POST /api/roadmap/revisions
 *
 * Analyzes the owner's free-text change request against the active roadmap,
 * recent check-ins and approved Brain, then persists ONLY a 'proposed' revision.
 * A revision is NEVER applied here — the owner must explicitly approve it via
 * /api/roadmap/revisions/[id]/approve.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => ({}))) as RevisionsRequestBody
    const locale = body.locale === 'ar' ? 'ar' : 'en'
    const roadmapId = typeof body.roadmapId === 'string' && UUID_RE.test(body.roadmapId) ? body.roadmapId : null
    const ownerRequest = typeof body.ownerRequest === 'string' ? body.ownerRequest.trim().slice(0, 4000) : ''
    if (!roadmapId) {
      return Response.json({ error: 'A valid roadmap id is required.' }, { status: 400 })
    }
    if (!ownerRequest) {
      return Response.json({ error: 'Describe the change you want to make.' }, { status: 400 })
    }

    const roadmapRes = await supabase
      .from('roadmaps')
      .select('id,goal,version,active_version_id')
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
    if (!activeVersion.id) {
      return Response.json({ error: 'The active roadmap version could not be found.' }, { status: 404 })
    }
    const summary = (activeVersion.summary ?? {}) as Partial<GeneratedRoadmap>

    const [stepsRes, checkinsRes, brainRes] = await Promise.all([
      supabase
        .from('roadmap_steps')
        .select('step_key,title,milestone_key,position')
        .eq('plan_version_id', activeVersion.id)
        .eq('workspace_id', user.id)
        .order('position', { ascending: true })
        .limit(200),
      supabase
        .from('roadmap_checkins')
        .select('completed_summary,actual_results,what_didnt_work,blockers,business_changes,director_recommendation')
        .eq('roadmap_id', roadmapId)
        .eq('workspace_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('brain_nodes')
        .select('id,title,summary,category,version')
        .eq('workspace_id', user.id)
        .eq('status', 'approved')
        .eq('is_current', true)
        .order('updated_at', { ascending: false })
        .limit(60),
    ])
    if (stepsRes.error) throw stepsRes.error
    if (checkinsRes.error) throw checkinsRes.error
    if (brainRes.error) throw brainRes.error

    const milestones = (summary.milestones ?? []).map((milestone) => ({
      key: milestone.key,
      title: milestone.title,
      actions: milestone.actions.map((action) => ({ key: action.key, title: action.title })),
    }))

    const checkins = (checkinsRes.data ?? []).map((row) => {
      const r = asRecord(row)
      return {
        completedSummary: typeof r.completed_summary === 'string' ? r.completed_summary : '',
        actualResults: typeof r.actual_results === 'string' ? r.actual_results : '',
        whatDidntWork: typeof r.what_didnt_work === 'string' ? r.what_didnt_work : '',
        blockers: typeof r.blockers === 'string' ? r.blockers : '',
        businessChanges: typeof r.business_changes === 'string' ? r.business_changes : '',
        recommendation: typeof r.director_recommendation === 'string' ? r.director_recommendation : '',
      }
    })

    const brain = (brainRes.data ?? []).map((row) => {
      const r = asRecord(row)
      return {
        id: String(r.id ?? ''),
        title: typeof r.title === 'string' ? r.title : '',
        summary: typeof r.summary === 'string' ? r.summary : '',
        category: typeof r.category === 'string' ? r.category : '',
        version: typeof r.version === 'number' ? r.version : 1,
      }
    }).filter((node) => node.id && node.title)

    const goal = typeof roadmap.goal === 'string' && roadmap.goal ? roadmap.goal : 'something_else'
    const result = await proposeRoadmapRevision({
      workspaceId: user.id,
      locale,
      goal,
      goalLabel: goal,
      ownerRequest,
      plan: {
        version: typeof roadmap.version === 'number' ? roadmap.version : 1,
        objectiveTitle: summary.primaryObjective?.title ?? '',
        objectiveOutcome: summary.primaryObjective?.outcome ?? '',
        milestones,
      },
      checkins,
      brain,
    })

    const payload = buildRoadmapPersistencePayload(result.proposal.proposedPlan, [])

    const saved = await supabase.rpc('save_roadmap_revision_proposal', {
      p_roadmap_id: roadmapId,
      p_expected_version: typeof roadmap.version === 'number' ? roadmap.version : 1,
      p_owner_request: ownerRequest,
      p_rationale: result.proposal.rationale,
      p_diff: result.proposal.diff,
      p_proposed_summary: payload.summary,
      p_proposed_steps: payload.steps,
    })
    if (saved.error) {
      return Response.json({ error: saved.error.message || 'The revision proposal could not be saved.' }, { status: errorStatus(saved.error) })
    }

    return Response.json({ revision: saved.data ?? null, diff: result.proposal.diff, rationale: result.proposal.rationale })
  } catch (error) {
    return apiError(error)
  }
}