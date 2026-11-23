import { requireAdminIdentity } from '@/server/admin/auth'
import { listTraces } from '@/server/admin/traces'
import { apiError } from '@/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await requireAdminIdentity()
    const url = new URL(request.url)
    const numeric = (key: string): number | undefined => {
      const raw = url.searchParams.get(key)
      if (!raw) return undefined
      const value = Number(raw)
      return Number.isFinite(value) ? value : undefined
    }
    const result = await listTraces({
      page: numeric('page') ?? 1,
      pageSize: numeric('pageSize') ?? 20,
      q: url.searchParams.get('q') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      route: url.searchParams.get('route') ?? undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
      workspaceId: url.searchParams.get('workspaceId') ?? undefined,
      userId: url.searchParams.get('userId') ?? undefined,
    })
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiError(error)
  }
}