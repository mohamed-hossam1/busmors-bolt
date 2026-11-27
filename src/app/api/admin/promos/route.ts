import { requireAdminIdentity, requireAdminMutation } from '@/server/admin/auth'
import { createAdminPromos, listAdminPromos } from '@/server/admin/promos'
import { apiError } from '@/server/auth'

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
    const result = await listAdminPromos({
      page: intParam(searchParams.get('page'), 1),
      pageSize: intParam(searchParams.get('pageSize'), 20),
      status: first(searchParams.get('status')),
      batch: first(searchParams.get('batch')),
      q: first(searchParams.get('q')),
    })
    return Response.json(result)
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request)
    const body = await request.json().catch(() => null)
    const items = await createAdminPromos(body)
    return Response.json({ data: items }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}