import { requireAdminIdentity } from '@/server/admin/auth'
import { apiError } from '@/server/auth'

export async function GET() {
  try {
    const session = await requireAdminIdentity()
    return Response.json({ isAdmin: true, email: session.user.email ?? null })
  } catch (error) {
    return apiError(error)
  }
}