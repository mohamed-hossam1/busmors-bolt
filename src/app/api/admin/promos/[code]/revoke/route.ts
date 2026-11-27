import { requireAdminMutation } from '@/server/admin/auth'
import { revokeAdminPromo } from '@/server/admin/promos'
import { apiError } from '@/server/auth'

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await requireAdminMutation(request)
    const { code } = await params
    const decoded = decodeURIComponent(code)
    const result = await revokeAdminPromo(decoded)
    return Response.json(result)
  } catch (error) {
    return apiError(error)
  }
}