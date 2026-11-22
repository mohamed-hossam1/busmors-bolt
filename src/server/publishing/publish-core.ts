import 'server-only'
import { createAdminClient } from '../supabase-admin'
import { getPublishingProvider, type PublishOutcome, type PublishingProvider } from './provider'

export interface PublishBackend { rpc<T>(name: string, args: Record<string, unknown>): Promise<T> }
export type PublishMode = 'now' | 'schedule'
export type PublishResult =
  | { state: 'not_configured' | 'not_approved' | 'already_attempted' | 'too_soon' }
  | { state: 'held'; reason?: 'auth_changed' }
  | { state: 'confirmed'; permalink: string | null }
  | { state: 'scheduled' }
  | { state: 'failed'; code: string }
  | { state: 'uncertain'; code: string }

type Claim =
  | { state: 'claimed'; attemptId: string; workspaceId: string; pageId: string; connectionRef: string; message: string; scheduleAt: number | null }
  | { state: 'not_approved' | 'already_attempted' | 'too_soon' }
  | { state: 'held'; reason?: 'auth_changed' }

/**
 * Sends one authorized post version to Facebook at most once: immediately ('now') or
 * as a Facebook-native scheduled post ('schedule'). The database claim
 * (claim_post_publish) is the only gate; a version that was ever claimed is never
 * sent again. Called only after the owner clicked Publish now or Schedule.
 * Never call this from render, page load, task completion or connection callbacks.
 */
export async function publishPost(deps: { db: PublishBackend; provider: PublishingProvider | null }, postId: string, mode: PublishMode): Promise<PublishResult> {
  if (!deps.provider) return { state: 'not_configured' }
  const claim = await deps.db.rpc<Claim>('claim_post_publish', { p_post_id: postId, p_mode: mode })
  if (claim.state !== 'claimed') return claim

  let outcome: PublishOutcome
  try {
    outcome = await deps.provider.publishText({
      workspaceId: claim.workspaceId,
      connectionRef: claim.connectionRef,
      pageId: claim.pageId,
      message: claim.message,
      ...(mode === 'schedule' && typeof claim.scheduleAt === 'number' ? { scheduleAt: Number(claim.scheduleAt) } : {}),
    })
  } catch {
    outcome = { kind: 'uncertain', code: 'unknown' }
  }

  try {
    await deps.db.rpc('record_publish_result', {
      p_attempt_id: claim.attemptId,
      p_state: outcome.kind,
      p_provider_id: outcome.kind === 'confirmed' ? outcome.providerPostId : null,
      p_permalink: outcome.kind === 'confirmed' ? outcome.permalink : null,
      p_evidence: outcome.kind === 'confirmed' ? outcome.evidence : {},
      p_error_code: outcome.kind === 'confirmed' ? null : outcome.code,
    })
  } catch {
    // The attempt stays 'claimed'; mark_stale_publish_attempts turns it into Needs review. Never retried.
    console.error('[publishing] could not record the result of attempt', claim.attemptId)
    return { state: 'uncertain', code: 'record_failed' }
  }

  if (outcome.kind === 'confirmed') return mode === 'schedule' ? { state: 'scheduled' } : { state: 'confirmed', permalink: outcome.permalink }
  return { state: outcome.kind, code: outcome.code }
}

/** Production wiring: admin Supabase client (throws on RPC error) + getPublishingProvider(). */
export function defaultPublishDeps(): { db: PublishBackend; provider: PublishingProvider | null } {
  const admin = createAdminClient()
  return {
    db: {
      async rpc<T>(name: string, args: Record<string, unknown>) {
        const { data, error } = await admin.rpc(name, args)
        if (error) throw new Error('rpc_failed:' + name)
        return data as T
      },
    },
    provider: getPublishingProvider(),
  }
}
