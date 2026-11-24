import { requireApiIdentity } from '@/server/auth'
import { getMetaAdsProvider } from '@/server/meta-ads/provider'
import { loadConnection, loadReport, saveReport } from '@/server/meta-ads/store'
import { failure, notConfigured } from '@/server/meta-ads/connection-http'
import { runSync } from '@/features/meta-ads/sync'
import { decideSync } from '@/features/meta-ads/freshness'
import { DATE_PRESETS, type DatePreset } from '@/features/meta-ads/contracts'

/** Runs a Meta Ads sync. The response never contains the report or the connectionRef. */
export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await requireApiIdentity(request)).user.id
  } catch (error) {
    if (error instanceof Response) return failure(error.status, error.status === 401 ? 'unauthorized' : 'forbidden', 'signInAgain')
    throw error
  }

  const provider = getMetaAdsProvider()
  if (!provider) return notConfigured()

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return failure(400, 'invalid_request', 'metaAdsInvalidRequest')
  }
  const body = (raw ?? {}) as { preset?: unknown; manual?: unknown }
  const presetValue = body.preset
  if (typeof presetValue !== 'string' || !DATE_PRESETS.includes(presetValue as DatePreset)) {
    return failure(400, 'invalid_request', 'metaAdsInvalidRequest')
  }
  const preset = presetValue as DatePreset
  const manual = body.manual === true

  const conn = await loadConnection(userId)
  if (conn?.status !== 'connected' || !conn.adAccount || !conn.connectionRef) {
    return failure(409, 'not_connected', 'metaAdsNotConnected')
  }

  const existing = await loadReport(userId, preset)
  const decision = decideSync({ manual, fetchedAt: existing?.fetchedAt ?? null, lastManualSyncAt: conn.lastManualSyncAt }, new Date())
  if (decision.action === 'skip') {
    return Response.json({ status: 'skipped', reason: decision.reason, retryAt: decision.retryAt ?? null })
  }

  try {
    const result = await runSync({ transport: provider, workspaceId: userId, connectionRef: conn.connectionRef, account: conn.adAccount, datePreset: preset, now: () => new Date() })
    if (result.ok) {
      await saveReport(userId, preset, conn.adAccount.id, result.report, null, manual)
      return Response.json({ status: 'synced' })
    }
    // Report is null on failure, so the RPC leaves the old report untouched and does
    // not start the manual cooldown.
    await saveReport(userId, preset, conn.adAccount.id, null, result.code, manual)
    return Response.json({ status: 'failed', code: result.code })
  } catch {
    await saveReport(userId, preset, conn.adAccount.id, null, 'provider_error', manual)
    return failure(500, 'provider_error', 'metaAdsSyncFailed')
  }
}