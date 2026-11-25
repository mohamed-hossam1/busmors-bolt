import 'server-only'
import { Composio } from '@composio/core'
import type { AdAccount, InsightsQuery, MetaAdsErrorCode, RawRow, TransportResult } from '../../features/meta-ads/contracts'
import { META_ADS_TOOLS, META_ADS_TOOLKIT_VERSION, assertAllowedTool } from '../../features/meta-ads/tools'
import { unwrapRows, nextCursor, parseAdAccounts, metaErrorCode, insightsArguments, listAccountsArguments } from '../../features/meta-ads/composio-parse'
import type { MetaAdsProvider } from './provider'

const INSIGHTS_TIMEOUT_MS = 20_000
const MAX_INSIGHTS_PAGES = 3

let client: Composio | null = null
function composio(): Composio {
  client ??= new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
  return client
}

function httpStatus(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : null
}

async function verify(workspaceId: string, connectionRef: string): Promise<boolean> {
  try {
    const owned = await composio().connectedAccounts.list({ userIds: [workspaceId], toolkitSlugs: ['metaads'] })
    if (!(owned.items ?? []).some((account) => account.id === connectionRef)) return false
    const account = await composio().connectedAccounts.get(connectionRef)
    return account.status === 'ACTIVE' && account.toolkit?.slug === 'metaads' && !account.isDisabled
  } catch {
    return false
  }
}

type RunResult = { ok: true; data: unknown } | { ok: false; code: MetaAdsErrorCode }

/**
 * Executes one read-only tool. `assertAllowedTool` runs first so a non-allowlisted
 * slug can never reach Composio. Races the call against a 20 s timeout and maps
 * failures to a stable code. Never throws for transport failures.
 */
async function run(slug: string, workspaceId: string, connectionRef: string, args: Record<string, unknown>): Promise<RunResult> {
  assertAllowedTool(slug)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), INSIGHTS_TIMEOUT_MS)
  })
  try {
    const result = await Promise.race([
      composio().tools.execute(slug, {
        userId: workspaceId,
        connectedAccountId: connectionRef,
        version: META_ADS_TOOLKIT_VERSION,
        arguments: args,
      }),
      timeout,
    ])
    if (result === 'timeout') return { ok: false, code: 'provider_error' }
    if (!result.successful) return { ok: false, code: metaErrorCode(String(result.error ?? '')) }
    return { ok: true, data: result.data }
  } catch (error) {
    const status = httpStatus(error)
    if (status === 401 || status === 403) return { ok: false, code: 'auth_expired' }
    return { ok: false, code: 'provider_error' }
  } finally {
    clearTimeout(timer)
  }
}

export const composioMetaAdsProvider: MetaAdsProvider = {
  name: 'composio',

  async startConnection(workspaceId, callbackUrl) {
    const request = await composio().connectedAccounts.link(workspaceId, process.env.COMPOSIO_META_ADS_AUTH_CONFIG_ID!, { callbackUrl, allowMultiple: true })
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

  async listAdAccounts(workspaceId, connectionRef): Promise<TransportResult<AdAccount[]>> {
    try {
      // Single call, no paging: METAADS_GET_AD_ACCOUNTS has no cursor and returns one page.
      const result = await run(META_ADS_TOOLS.listAdAccounts, workspaceId, connectionRef, listAccountsArguments())
      if (!result.ok) return result
      return { ok: true, value: parseAdAccounts(unwrapRows(result.data)) }
    } catch {
      return { ok: false, code: 'provider_error' }
    }
  },

  async getInsights(workspaceId, connectionRef, query: InsightsQuery): Promise<TransportResult<RawRow[]>> {
    try {
      const rows: RawRow[] = []
      let after: string | undefined
      for (let page = 0; page < MAX_INSIGHTS_PAGES; page++) {
        const result = await run(META_ADS_TOOLS.insights, workspaceId, connectionRef, insightsArguments(query, after))
        if (!result.ok) return result
        rows.push(...unwrapRows(result.data))
        after = nextCursor(result.data)
        if (!after) break
      }
      return { ok: true, value: rows }
    } catch {
      return { ok: false, code: 'provider_error' }
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