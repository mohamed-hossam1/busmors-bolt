import { requireApiIdentity, apiError } from '@/server/auth'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RouteContext = { params: Promise<{ id: string }> }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function errorStatus(error: unknown): number {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : ''
  if (message.includes('REVISION_NOT_FOUND')) return 404
  if (message.includes('NOT_AUTHENTICATED')) return 401
  return 500
}

/**
 * POST /api/roadmap/revisions/[id]/reject
 *
 * Owner rejection of a proposed revision via reject_roadmap_revision. The active
 * roadmap is left untouched.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { supabase } = await requireApiIdentity(request)
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'A valid revision id is required.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('reject_roadmap_revision', { p_revision_id: id })
    if (error) {
      return Response.json({ error: error.message || 'The revision could not be rejected.' }, { status: errorStatus(error) })
    }

    return Response.json({ revision: asRecord(data) })
  } catch (error) {
    return apiError(error)
  }
}