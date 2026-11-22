'use server'
import { getIdentity } from './auth'

export interface PublishingStatus {
 configured: boolean
 connection: { status: 'connected' | 'expired' | 'disconnected'; pageName: string | null } | null
 autoPublishActive: boolean
}

/** One call per page: provider configuration, the Facebook connection, and auto-publish health. */
export async function loadPublishingStatus(): Promise<PublishingStatus> {
 const identity = await getIdentity()
 if (!identity) return { configured: false, connection: null, autoPublishActive: false }
 const { data } = await identity.supabase.from('platform_connections').select('status,page_name').eq('platform', 'facebook').maybeSingle()
 return {
  // The publishing provider arrives in Phase 4; the publisher heartbeat in Phase 6.
  configured: false,
  connection: data ? { status: data.status as 'connected' | 'expired' | 'disconnected', pageName: (data.page_name as string | null) ?? null } : null,
  autoPublishActive: false,
 }
}
