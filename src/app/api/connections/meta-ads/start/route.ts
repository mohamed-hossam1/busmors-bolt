import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireApiIdentity } from '@/server/auth'
import { getMetaAdsProvider } from '@/server/meta-ads/provider'
import { META_CONNECT_COOKIE, failure, notConfigured, setFlowCookie } from '@/server/meta-ads/connection-http'

/** Starts connecting a Meta Ads account. Sends nothing to Meta; returns the consent URL. */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, error.status === 401 ? 'unauthorized' : 'forbidden', 'signInAgain')
    throw error
  }
  const provider = getMetaAdsProvider()
  if (!provider) return notConfigured()
  const nonce = randomBytes(32).toString('base64url')
  const origin = new URL(request.url).origin
  try {
    const { redirectUrl } = await provider.startConnection(userId, origin + '/api/connections/meta-ads/callback?nonce=' + nonce)
    const response = NextResponse.json({ redirectUrl })
    setFlowCookie(response, META_CONNECT_COOKIE, nonce)
    return response
  } catch {
    return failure(502, 'connection_start_failed', 'facebookConnectFailed')
  }
}