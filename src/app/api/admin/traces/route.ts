import { requireAdminIdentity } from '@/server/admin/auth'
import { listTraces } from '@/server/admin/traces'
import type { AdminTraceListFilters } from '@/features/admin/types'
import { apiError } from '@/server/auth'

/**
 * Admin trace listing (Phase 7 Part C).
 *
 * GET /api/admin/traces -> paginated, filtered trace list. Guarded by
 * requireAdminIdentity(); identity is derived strictly from the authenticated
 * server session (never caller-supplied). Read-only.
 */

function first(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function intParam(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

export async function GET(request: Request) {
  try {
    await requireAdminIdentity()
    const { searchParams } = new URL(request.url)
    const filters: AdminTraceListFilters = {
      page: intParam(searchParams.get('page'), 1),
      pageSize: intParam(searchParams.get('pageSize'), 20),
      q: first(searchParams.get('q')),
      status: first(searchParams.get('status')),
      route: first(searchParams.get('route')),
      workspaceId: first(searchParams.get('workspaceId')),
      userId: first(searchParams.get('userId')),
      from: first(searchParams.get('from')),
      to: first(searchParams.get('to')),
    }
    const result = await listTraces(filters)
    return Response.json(result)
  } catch (error) {
    return apiError(error)
  }
}