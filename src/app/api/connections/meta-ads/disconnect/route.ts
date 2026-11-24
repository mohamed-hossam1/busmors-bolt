import { requireApiIdentity } from '@/server/auth'
import { getMetaAdsProvider } from '@/server/meta-ads/provider'
import { loadConnection, disconnectConnection } from '@/server/meta-ads/store'
import { failure } from '@/server/meta-ads/connection-http'

/** Disconnects the Meta Ads account. The cached report is cleared by the RPC. */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, error.status === 401 ? 'unauthorized' : 'forbidden', 'signInAgain')
    throw error
  }
  const conn = await loadConnection(userId)
  const provider = getMetaAdsProvider()
  try {
    if (provider && conn?.connectionRef) await provider.disconnect(userId, conn.connectionRef)
  } catch {
    return failure(502, 'disconnect_failed', 'metaAdsDisconnectFailed')
  }
  if (!(await disconnectConnection(userId))) return failure(500, 'disconnect_failed', 'metaAdsDisconnectFailed')
  return Response.json({ ok: true })
}