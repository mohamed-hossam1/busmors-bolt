import 'server-only'
import type { MetaAdsTransport } from '../../features/meta-ads/contracts'
import { composioMetaAdsProvider } from './composio-provider'
import { fakeMetaAdsProvider } from './fake-provider'

export interface MetaAdsProvider extends MetaAdsTransport {
  readonly name: string
  startConnection(workspaceId: string, callbackUrl: string): Promise<{ redirectUrl: string }>
  completeConnection(workspaceId: string, callbackParams: URLSearchParams): Promise<{ ok: true; connectionRef: string } | { ok: false; reason: 'denied' | 'invalid' }>
  verifyConnection(workspaceId: string, connectionRef: string): Promise<boolean>
  disconnect(workspaceId: string, connectionRef: string): Promise<void>
}

/** null when META_ADS_PROVIDER is 'disabled', unknown, or missing env vars. */
export function getMetaAdsProvider(): MetaAdsProvider | null {
  const selected = (process.env.META_ADS_PROVIDER ?? '').trim().toLowerCase()
  if (selected === 'composio') {
    return process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_META_ADS_AUTH_CONFIG_ID ? composioMetaAdsProvider : null
  }
  if (selected === 'fake') {
    return fakeMetaAdsProvider
  }
  return null
}

export function isMetaAdsEnabled(): boolean {
  return getMetaAdsProvider() !== null
}