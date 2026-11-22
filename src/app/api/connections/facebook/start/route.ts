import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireApiIdentity } from '@/server/auth'
import { getPublishingProvider } from '@/server/publishing/provider'
import { CONNECT_COOKIE, failure, notConfigured, setFlowCookie } from '@/server/publishing/connection-http'

/** Starts connecting a Facebook Page. Sends nothing to Facebook; returns the consent URL. */
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
  const nonce = randomBytes(32).toString('base64url')
  const origin = new URL(request.url).origin
  try {
    const { redirectUrl } = await provider.startConnection(userId, origin + '/api/connections/facebook/callback?nonce=' + nonce)
    const response = NextResponse.json({ redirectUrl })
    setFlowCookie(response, CONNECT_COOKIE, nonce)
    return response
  } catch {
    return failure(502, 'connection_start_failed', 'facebookConnectFailed')
  }
}
