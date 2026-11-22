import 'server-only'
import { Composio } from '@composio/core'
import type { FacebookPage, PublishOutcome, PublishingProvider } from './provider'

/*
 * Verified against the live Composio API and @composio/core 0.28.0 on 22 Nov 2026:
 * - Start: connectedAccounts.link(userId, authConfigId, { callbackUrl }) -> { id, redirectUrl }.
 *   connectedAccounts.initiate() is retired for Composio-managed OAuth (cutover 2026-07-03).
 * - Callback query parameters appended to callbackUrl (docs.composio.dev, Connect Link):
 *   `status` ('success' | 'failed') and `connected_account_id`. Our own params (nonce) are kept.
 *   These are never trusted alone: every account is re-verified below.
 * - connectedAccounts.get(id) -> { status: 'ACTIVE' | ..., toolkit: { slug }, isDisabled } and has
 *   NO user id; ownership is checked with connectedAccounts.list({ userIds, toolkitSlugs }).
 * - connectedAccounts.delete(id); deleting again returns HTTP 404 (ignored).
 * - link() needs { allowMultiple: true } once the user already has a connected account,
 *   otherwise it throws "Multiple connected accounts found ... use the allowMultiple option".
 * - Tools (toolkit version pinned below):
 *   FACEBOOK_GET_USER_PAGES { fields, limit, after, user_id } -> data: { data: [{ id, name }], paging }.
 *     Its default fields include Page access tokens, so fields is always 'id,name'.
 *   FACEBOOK_CREATE_POST { page_id, message, published (default true), link, ... } (required: page_id, message).
 *   (The plan's FACEBOOK_LIST_MANAGED_PAGES does not exist.)
 * - tools.execute(slug, { userId, connectedAccountId, version, arguments }) -> { data, error, successful, logId }.
 * Composio user id = BUSMORA workspace id; never taken from client input.
 */
const FACEBOOK_TOOLKIT_VERSION = '20261116_01'
const PUBLISH_TIMEOUT_MS = 20_000

let client: Composio | null = null
function composio(): Composio {
  client ??= new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
  return client
}

function httpStatus(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : null
}

async function verify(workspaceId: string, connectedAccountId: string): Promise<boolean> {
  try {
    const owned = await composio().connectedAccounts.list({ userIds: [workspaceId], toolkitSlugs: ['facebook'] })
    if (!(owned.items ?? []).some((account) => account.id === connectedAccountId)) return false
    const account = await composio().connectedAccounts.get(connectedAccountId)
    return account.status === 'ACTIVE' && account.toolkit?.slug === 'facebook' && !account.isDisabled
  } catch {
    return false
  }
}

/** Finds the created post id in the tool response (shape differs between toolkit versions). */
function postIdFrom(data: Record<string, unknown> | undefined): string | null {
  const candidates = [data, data?.data, data?.response_data] as (Record<string, unknown> | undefined)[]
  for (const candidate of candidates) {
    const id = candidate?.id ?? candidate?.post_id
    if (typeof id === 'string' && id.trim()) return id
  }
  return null
}

function failureCode(message: string): 'auth_expired' | 'permission_denied' | 'invalid_request' | 'provider_error' {
  if (/expired|session has been invalidated|\b190\b|re-?authenticat|access token/i.test(message)) return 'auth_expired'
  if (/permission|not authori[sz]ed|\(#200\)|\(#10\)|\b(200|10)\b.*permission/i.test(message)) return 'permission_denied'
  if (/invalid|required|\(#100\)|parameter|too long/i.test(message)) return 'invalid_request'
  return 'provider_error'
}

export const composioProvider: PublishingProvider = {
  name: 'composio',

  async startConnection(workspaceId, callbackUrl) {
    // allowMultiple: without it link() throws once the user has any connected account
    // (e.g. a reconnect, or an earlier attempt). The saved account is the one in
    // platform_connections; the previous one is deleted when a new one is saved.
    const request = await composio().connectedAccounts.link(workspaceId, process.env.COMPOSIO_FACEBOOK_AUTH_CONFIG_ID!, { callbackUrl, allowMultiple: true })
    if (!request.redirectUrl) throw new Error('connect_link_unavailable')
    return { redirectUrl: request.redirectUrl }
  },

  async completeConnection(workspaceId, callbackParams) {
    const status = callbackParams.get('status')
    if (status && status !== 'success') return { ok: false, reason: 'denied' }
    const id = callbackParams.get('connected_account_id')
    if (!id || !/^[A-Za-z0-9_-]{4,100}$/.test(id)) return { ok: false, reason: 'invalid' }
    return (await verify(workspaceId, id)) ? { ok: true, connectionRef: id } : { ok: false, reason: 'invalid' }
  },

  verifyConnection: verify,

  async listPages(workspaceId, connectionRef) {
    const pages: FacebookPage[] = []
    let after: string | undefined
    for (let page = 0; page < 5; page++) {
      const result = await composio().tools.execute('FACEBOOK_GET_USER_PAGES', {
        userId: workspaceId,
        connectedAccountId: connectionRef,
        version: FACEBOOK_TOOLKIT_VERSION,
        arguments: { fields: 'id,name', limit: 100, ...(after ? { after } : {}) },
      })
      if (!result.successful) throw new Error('list_pages_failed')
      // Observed: result.data = { data: [{ id, name }], paging }. Older toolkit versions
      // wrapped it in response_data. result.data.data is the Page array itself.
      const body = ((result.data?.response_data as Record<string, unknown> | undefined) ?? result.data) as { data?: unknown; paging?: { cursors?: { after?: string }; next?: string } }
      const rows = Array.isArray(body?.data) ? body.data : []
      for (const row of rows as { id?: unknown; name?: unknown }[]) {
        if (typeof row?.id === 'string' && row.id) pages.push({ id: row.id, name: typeof row.name === 'string' && row.name.trim() ? row.name : row.id })
      }
      after = body?.paging?.next ? body.paging.cursors?.after : undefined
      if (!after) break
    }
    return pages
  },

  async publishText({ workspaceId, connectionRef, pageId, message }): Promise<PublishOutcome> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), PUBLISH_TIMEOUT_MS) })
    try {
      const result = await Promise.race([
        composio().tools.execute('FACEBOOK_CREATE_POST', {
          userId: workspaceId,
          connectedAccountId: connectionRef,
          version: FACEBOOK_TOOLKIT_VERSION,
          arguments: { page_id: pageId, message, published: true },
        }),
        timeout,
      ])
      if (result === 'timeout') return { kind: 'uncertain', code: 'timeout' }
      if (!result.successful) return { kind: 'failed', code: failureCode(String(result.error ?? '')) }
      const id = postIdFrom(result.data)
      // Successful but unreadable: the post may exist, so it is not reported as published.
      if (!id) return { kind: 'uncertain', code: 'unknown' }
      return {
        kind: 'confirmed',
        providerPostId: id,
        permalink: /^\d+_\d+$/.test(id) ? 'https://www.facebook.com/' + id : null,
        evidence: { id, ...(result.logId ? { logId: result.logId } : {}) },
      }
    } catch (error) {
      const status = httpStatus(error)
      // A 4xx from Composio means the request was rejected before reaching Facebook.
      if (status !== null && status >= 400 && status < 500) {
        return { kind: 'failed', code: status === 401 || status === 403 ? 'auth_expired' : 'invalid_request' }
      }
      // Network errors and 5xx happen after sending: the post may exist.
      return { kind: 'uncertain', code: status === null ? 'network' : 'unknown' }
    } finally {
      clearTimeout(timer)
    }
  },

  async disconnect(_workspaceId, connectionRef) {
    try {
      await composio().connectedAccounts.delete(connectionRef)
    } catch (error) {
      if (httpStatus(error) !== 404) throw error
    }
  },
}
