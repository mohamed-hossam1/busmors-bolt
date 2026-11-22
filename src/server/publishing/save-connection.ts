import 'server-only'
import { createAdminClient } from '../supabase-admin'
import type { ConnectionRef, FacebookPage, PublishingProvider } from './provider'

/**
 * Saves the chosen Page for the workspace. When this replaces a different provider
 * account, the previous account is removed at the provider afterwards so stale
 * authorizations do not pile up. Returns false when saving failed.
 */
export async function saveFacebookConnection(provider: PublishingProvider, workspaceId: string, connectionRef: ConnectionRef, page: FacebookPage): Promise<boolean> {
  const admin = createAdminClient()
  const { data: previous } = await admin.from('platform_connections').select('external_account_id').eq('workspace_id', workspaceId).eq('platform', 'facebook').maybeSingle()
  const { error } = await admin.rpc('upsert_facebook_connection', { p_workspace_id: workspaceId, p_connection_ref: connectionRef, p_page_id: page.id, p_page_name: page.name })
  if (error) return false
  const old = previous?.external_account_id as string | null | undefined
  if (old && old !== connectionRef) {
    // Best effort: the new connection is already saved and the old one is no longer used.
    await provider.disconnect(workspaceId, old).catch(() => {})
  }
  return true
}
