'use server'
import { getIdentity } from './auth'
import { getPublishingProvider } from './publishing/provider'

export interface PublishingStatus {
 configured: boolean
 connection: { status: 'connected' | 'expired' | 'disconnected'; pageName: string | null } | null
 autoPublishActive: boolean
}

/** One call per page: provider configuration, the Facebook connection, and auto-publish health. */
export async function loadPublishingStatus(): Promise<PublishingStatus> {
 const identity = await getIdentity()
 const configured = getPublishingProvider() !== null
 if (!identity) return { configured, connection: null, autoPublishActive: false }
 const { data } = await identity.supabase.from('platform_connections').select('status,page_name').eq('platform', 'facebook').maybeSingle()
 return {
  configured,
  // The publisher heartbeat arrives in Phase 6.
  connection: data ? { status: data.status as 'connected' | 'expired' | 'disconnected', pageName: (data.page_name as string | null) ?? null } : null,
  autoPublishActive: false,
 }
}
