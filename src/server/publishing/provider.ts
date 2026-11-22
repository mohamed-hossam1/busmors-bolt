import 'server-only'
import { composioProvider } from './composio-provider'
import { fakeProvider } from './fake-provider'

/** Opaque provider reference to one authorized account. Stored in platform_connections.external_account_id. Never sent to the browser. */
export type ConnectionRef = string
export interface FacebookPage { id: string; name: string }
export type PublishOutcome =
  | { kind: 'confirmed'; providerPostId: string; permalink: string | null; evidence: Record<string, unknown> }
  | { kind: 'failed'; code: 'auth_expired' | 'permission_denied' | 'invalid_request' | 'provider_error' }   // definitely not published
  | { kind: 'uncertain'; code: 'timeout' | 'network' | 'unknown' }                                          // may have published

/**
 * BUSMORA only creates Facebook posts. There is deliberately no method that edits,
 * deletes, unpublishes or reads back a Facebook post; keep it that way in every adapter.
 */
export interface PublishingProvider {
  readonly name: string
  /** Returns the provider's consent URL. callbackUrl is where the provider sends the browser back. */
  startConnection(workspaceId: string, callbackUrl: string): Promise<{ redirectUrl: string }>
  /** Reads the provider's callback parameters, checks the account is active, belongs to workspaceId, and is Facebook. */
  completeConnection(workspaceId: string, callbackParams: URLSearchParams): Promise<{ ok: true; connectionRef: ConnectionRef } | { ok: false; reason: 'denied' | 'invalid' }>
  verifyConnection(workspaceId: string, connectionRef: ConnectionRef): Promise<boolean>
  listPages(workspaceId: string, connectionRef: ConnectionRef): Promise<FacebookPage[]>
  /** Never throws. Must finish within 20 seconds; a timeout after sending is 'uncertain'. */
  publishText(input: { workspaceId: string; connectionRef: ConnectionRef; pageId: string; message: string }): Promise<PublishOutcome>
  /** Ignores "not found". */
  disconnect(workspaceId: string, connectionRef: ConnectionRef): Promise<void>
}

/** null when PUBLISHING_PROVIDER is 'disabled', unknown, missing its env vars, or 'fake' while NODE_ENV==='production'. */
export function getPublishingProvider(): PublishingProvider | null {
  const selected = (process.env.PUBLISHING_PROVIDER ?? '').trim().toLowerCase()
  if (selected === 'composio') {
    return process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID ? composioProvider : null
  }
  if (selected === 'fake') {
    if (process.env.NODE_ENV === 'production') {
      console.error('[publishing] PUBLISHING_PROVIDER=fake is refused in production; publishing is disabled.')
      return null
    }
    return fakeProvider
  }
  return null
}
