import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireApiIdentity } from '@/server/auth'
import { getPublishingProvider } from '@/server/publishing/provider'
import { saveFacebookConnection } from '@/server/publishing/save-connection'
import { PENDING_COOKIE, clearFlowCookie, failure, notConfigured } from '@/server/publishing/connection-http'

/** Saves the Page the owner chose. The Page must belong to the verified account. */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, error.status === 401 ? 'unauthorized' : 'forbidden', 'signInAgain')
    throw error
  }
  const provider = getPublishingProvider()
  if (!provider) return notConfigured()
  const body = await request.json().catch(() => null) as { pageId?: unknown } | null
  const pageId = typeof body?.pageId === 'string' ? body.pageId : ''
  if (!pageId || pageId.length > 100) return failure(400, 'invalid_page', 'facebookChoosePage')
  const ref = (await cookies()).get(PENDING_COOKIE)?.value
  if (!ref || !(await provider.verifyConnection(userId, ref))) return failure(409, 'connection_expired', 'facebookChooseExpired')
  try {
    const page = (await provider.listPages(userId, ref)).find((candidate) => candidate.id === pageId)
    if (!page) return failure(400, 'invalid_page', 'facebookChoosePage')
    if (!(await saveFacebookConnection(provider, userId, ref, page))) return failure(500, 'connection_save_failed', 'facebookConnectFailed')
    const response = NextResponse.json({ ok: true })
    clearFlowCookie(response, PENDING_COOKIE)
    return response
  } catch {
    return failure(502, 'pages_unavailable', 'facebookConnectFailed')
  }
}
