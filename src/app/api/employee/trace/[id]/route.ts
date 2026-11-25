import { requireApiIdentity, apiError } from '@/server/auth'
import { loadWorkspaceTrace } from '@/server/employee/trace-store'

/**
 * Customer-facing execution trace (Phase 7 Part B).
 *
 * GET /api/employee/trace/:id -> the sanitized Canvas events for a trace id, or
 * for a conversation id (resolves to that conversation's latest trace). The id is
 * verified against the authenticated workspace; traces owned by another workspace
 * are reported as not found. Payloads are projected to the minimal Canvas shape
 * (agent states, used tools, loaded skills) — never raw admin trace payloads.
 */

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { user } = await requireApiIdentity(request)
    const { id } = await params
    const trace = await loadWorkspaceTrace(id, user.id)
    if (!trace) {
      return Response.json({ error: 'This trace could not be found.' }, { status: 404 })
    }
    return Response.json(trace)
  } catch (error) {
    return apiError(error)
  }
}