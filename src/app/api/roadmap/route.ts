import { requireApiIdentity, apiError } from '@/server/auth'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** GET /api/roadmap — load the workspace's active roadmap (or null). */
export async function GET(request: Request) {
  try {
    const { supabase } = await requireApiIdentity(request)
    const { data, error } = await supabase.rpc('load_active_roadmap')
    if (error) throw error
    const loaded = asRecord(data)
    return Response.json({
      roadmap: loaded.roadmap ?? null,
      activeVersion: loaded.activeVersion ?? null,
      steps: Array.isArray(loaded.steps) ? loaded.steps : [],
      staleDependencies: Array.isArray(loaded.staleDependencies) ? loaded.staleDependencies : [],
      stepActions: Array.isArray(loaded.stepActions) ? loaded.stepActions : [],
      linkedDeliverables: Array.isArray(loaded.linkedDeliverables) ? loaded.linkedDeliverables : [],
      linkedPosts: Array.isArray(loaded.linkedPosts) ? loaded.linkedPosts : [],
      versions: Array.isArray(loaded.versions) ? loaded.versions : [],
      checkins: Array.isArray(loaded.checkins) ? loaded.checkins : [],
      pendingRevision: loaded.pendingRevision ?? null,
      learningLog: Array.isArray(loaded.learningLog) ? loaded.learningLog : [],
    })
  } catch (error) {
    return apiError(error)
  }
}

interface PatchRequestBody {
  roadmapId?: unknown
  expectedVersion?: unknown
  primaryObjective?: unknown
}

/** PATCH /api/roadmap — edit the primary objective with optimistic concurrency. */
export async function PATCH(request: Request) {
  try {
    const { supabase } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => ({}))) as PatchRequestBody
    const roadmapId = typeof body.roadmapId === 'string' ? body.roadmapId : ''
    const expectedVersion = typeof body.expectedVersion === 'number' ? body.expectedVersion : null
    const primaryObjective = body.primaryObjective
    if (!UUID_RE.test(roadmapId) || expectedVersion === null || !primaryObjective || typeof primaryObjective !== 'object') {
      return Response.json({ error: 'A roadmap, expected version and primary objective are required.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('update_roadmap_objective', {
      p_roadmap_id: roadmapId,
      p_expected_version: expectedVersion,
      p_primary_objective: primaryObjective,
    })
    if (error) throw error

    const updated = asRecord(data)
    return Response.json({
      roadmap: updated.roadmap ?? null,
      activeVersion: updated.activeVersion ?? null,
    })
  } catch (error) {
    return apiError(error)
  }
}