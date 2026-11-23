import { requireAdminIdentity } from '@/server/admin/auth'
import { adminHealth } from '@/server/admin/traces'
import { apiError } from '@/server/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAdminIdentity()
    return Response.json(await adminHealth(), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return apiError(error)
  }
}