import { requireAdminIdentity } from '@/server/admin/auth'
import { getTraceDetail } from '@/server/admin/traces'
import { apiError } from '@/server/auth'

/**
 * Admin trace detail (Phase 7 Part C).
 *
 * GET /api/admin/traces/:id -> the full trace plus its ordered events for the
 * Quality Inspector. Guarded by requireAdminIdentity(); read-only.
 */

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireAdminIdentity()
    const { id } = await params
    const detail = await getTraceDetail(id)
    if (!detail) {
      return Response.json({ error: 'This trace could not be found.' }, { status: 404 })
    }
    return Response.json(detail)
  } catch (error) {
    return apiError(error)
  }
}