import { requireApiIdentity } from '@/server/auth'
import { getMetaAdsProvider } from '@/server/meta-ads/provider'
import { loadConnection, selectAccount } from '@/server/meta-ads/store'
import { failure, notConfigured } from '@/server/meta-ads/connection-http'

const AD_ACCOUNT_ID = /^act_[0-9]{1,30}$/

/** Saves the Meta Ads account the owner chose. The currency and timezone always come from the server list. */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, error.status === 401 ? 'unauthorized' : 'forbidden', 'signInAgain')
    throw error
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return failure(400, 'invalid_request', 'metaAdsInvalidRequest')
  }
  const body = (raw ?? {}) as { adAccountId?: unknown }
  const adAccountId = typeof body.adAccountId === 'string' ? body.adAccountId : ''
  if (!AD_ACCOUNT_ID.test(adAccountId)) return failure(400, 'invalid_request', 'metaAdsInvalidRequest')

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

  const account = listed.value.find((candidate) => candidate.active && candidate.id === adAccountId)
  if (!account) return failure(400, 'invalid_request', 'metaAdsInvalidRequest')

  if (!(await selectAccount(userId, account))) return failure(500, 'select_failed', 'metaAdsSyncFailed')
  return Response.json({ ok: true })
}