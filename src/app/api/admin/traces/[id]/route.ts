import { requireAdminIdentity } from '@/server/admin/auth'
import { getTraceDetail } from '@/server/admin/traces'
import { apiError } from '@/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminIdentity()
    const { id } = await context.params
    const detail = await getTraceDetail(id)
    if (!detail) return Response.json({ error: 'Not found.' }, { status: 404 })
    return Response.json(detail, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiError(error)
  }
}