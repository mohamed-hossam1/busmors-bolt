import { requireAdminMutation } from '@/server/admin/auth'
import { grantAdminHeavyTasks } from '@/server/admin/promos'
import { apiError } from '@/server/auth'

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request)
    const body = await request.json().catch(() => null)
    const result = await grantAdminHeavyTasks(body)
    return Response.json(result)
  } catch (error) {
    return apiError(error)
  }
}