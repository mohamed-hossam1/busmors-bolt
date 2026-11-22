import { requireApiIdentity } from '@/server/auth'
import { createAdminClient } from '@/server/supabase-admin'
import { getPublishingProvider } from '@/server/publishing/provider'
import { failure } from '@/server/publishing/connection-http'

/** Disconnects the Facebook Page. Scheduled posts are held and must be scheduled again. */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, error.status === 401 ? 'unauthorized' : 'forbidden', 'signInAgain')
    throw error
  }
  const admin = createAdminClient()
  const { data } = await admin.from('platform_connections').select('external_account_id').eq('workspace_id', userId).eq('platform', 'facebook').maybeSingle()
  const provider = getPublishingProvider()
  try {
    if (provider && data?.external_account_id) await provider.disconnect(userId, data.external_account_id)
  } catch {
    return failure(502, 'disconnect_failed', 'facebookDisconnectFailed')
  }
  const { error } = await admin.rpc('disconnect_facebook_connection', { p_workspace_id: userId })
  if (error) return failure(500, 'disconnect_failed', 'facebookDisconnectFailed')
  return Response.json({ ok: true })
}
