import { cookies } from 'next/headers'
import { requireApiIdentity } from '@/server/auth'
import { getPublishingProvider } from '@/server/publishing/provider'
import { PENDING_COOKIE, failure, notConfigured } from '@/server/publishing/connection-http'

/** Pages the owner can choose from after connecting an account that manages several Pages. */
export async function GET(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, 'unauthorized', 'signInAgain')
    throw error
  }
  const provider = getPublishingProvider()
  if (!provider) return notConfigured()
  const ref = (await cookies()).get(PENDING_COOKIE)?.value
  // The cookie is not signed, so the account is always re-verified for this workspace.
  if (!ref || !(await provider.verifyConnection(userId, ref))) return failure(409, 'connection_expired', 'facebookChooseExpired')
  try {
    return Response.json(await provider.listPages(userId, ref))
  } catch {
    return failure(502, 'pages_unavailable', 'facebookConnectFailed')
  }
}
