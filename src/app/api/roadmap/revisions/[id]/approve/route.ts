import { requireApiIdentity, apiError } from '@/server/auth'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RouteContext = { params: Promise<{ id: string }> }

interface ApproveRequestBody {
  expectedVersion?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function errorStatus(error: unknown): number {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : ''
  if (message.includes('STALE_VERSION')) return 409
  if (message.includes('REVISION_NOT_FOUND') || message.includes('ROADMAP_NOT_FOUND')) return 404
  if (message.includes('REVISION_NOT_PENDING')) return 409
  if (message.includes('NOT_AUTHENTICATED')) return 401
  return 500
}

/**
 * POST /api/roadmap/revisions/[id]/approve
 *
 * Owner approval is mandatory. Applies the proposed revision by creating a new
 * immutable roadmap version (archiving the current one) via
 * approve_roadmap_revision, and returns the refreshed active roadmap load.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { supabase } = await requireApiIdentity(request)
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'A valid revision id is required.' }, { status: 400 })
    }
    const body = (await request.json().catch(() => ({}))) as ApproveRequestBody
    const expectedVersion = typeof body.expectedVersion === 'number' ? body.expectedVersion : null

    const { data, error } = await supabase.rpc('approve_roadmap_revision', {
      p_revision_id: id,
      p_expected_roadmap_version: expectedVersion,
    })
    if (error) {
      return Response.json({ error: error.message || 'The revision could not be applied.' }, { status: errorStatus(error) })
    }

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