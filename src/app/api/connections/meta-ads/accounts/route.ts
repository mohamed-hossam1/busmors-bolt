import { requireApiIdentity } from '@/server/auth'
import { getMetaAdsProvider } from '@/server/meta-ads/provider'
import { loadConnection } from '@/server/meta-ads/store'
import { failure, notConfigured } from '@/server/meta-ads/connection-http'

/** Lists the active Meta Ads accounts the owner can choose from after connecting. */
export async function GET(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, error.status === 401 ? 'unauthorized' : 'forbidden', 'signInAgain')
    throw error
  }
  const provider = getMetaAdsProvider()
  if (!provider) return notConfigured()
  const conn = await loadConnection(userId)
  if (!conn?.connectionRef || (conn.status !== 'pending_account' && conn.status !== 'connected')) {
    return failure(409, 'not_connected', 'metaAdsNotConnected')
  }
  if (!(await provider.verifyConnection(userId, conn.connectionRef))) {
    return failure(409, 'reconnect', 'adsReconnect')
  }
  const listed = await provider.listAdAccounts(userId, conn.connectionRef)
  if (!listed.ok) return failure(502, listed.code, 'metaAdsSyncFailed')
  const accounts = listed.value
    .filter((account) => account.active)
    .map(({ id, name, currency, timezoneName }) => ({ id, name, currency, timezoneName }))
  return Response.json({ accounts })
}