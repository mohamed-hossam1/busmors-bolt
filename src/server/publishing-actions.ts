'use server'
import { getIdentity } from './auth'
import { getPublishingProvider } from './publishing/provider'
import { defaultPublishDeps, publishPost, type PublishMode, type PublishResult } from './publishing/publish-core'
import type { TranslationKey } from '../lib/i18n'
import { serverTranslator, type ServerTranslate } from './server-copy'

export interface PublishingStatus {
 configured: boolean
 connection: { status: 'connected' | 'expired' | 'disconnected'; pageName: string | null } | null
}

/** One call per page: provider configuration and the Facebook connection. */
export async function loadPublishingStatus(): Promise<PublishingStatus> {
 const identity = await getIdentity()
 const configured = getPublishingProvider() !== null
 if (!identity) return { configured, connection: null }
 const { data } = await identity.supabase.from('platform_connections').select('status,page_name').eq('platform', 'facebook').maybeSingle()
 return {
  configured,
  connection: data ? { status: data.status as 'connected' | 'expired' | 'disconnected', pageName: (data.page_name as string | null) ?? null } : null,
 }
}

const uuid = /^[0-9a-f-]{36}$/i
const RPC_ERRORS: [string, TranslationKey][] = [
 ['VERSION_CONFLICT', 'errVersionConflict'],
 ['NOT_APPROVED', 'errNotApproved'],
 ['NO_CONNECTION', 'errNoConnection'],
 ['HELD', 'errHeld'],
 ['TIME_OUT_OF_RANGE', 'errTimeOutOfRange'],
 ['ALREADY_ATTEMPTED', 'errAlreadyAttempted'],
 ['INVALID_ZONE', 'errInvalidZone'],
 ['INVALID_TRANSITION', 'errInvalidTransition'],
 ['NOT_FOUND', 'errPostMissing'],
]

function rpcError(t: ServerTranslate, message: string | undefined): string {
 const found = RPC_ERRORS.find(([code]) => message?.includes(code))
 return t(found ? found[1] : 'errPostSave')
}

function validArgs(postId: string, expectedVersion: number) {
 return typeof postId === 'string' && uuid.test(postId) && Number.isInteger(expectedVersion) && expectedVersion > 0
}

/** Owner-safe error for a send that did not end as confirmed/scheduled. */
function resultError(t: ServerTranslate, result: PublishResult): string | undefined {
 if (result.state === 'confirmed' || result.state === 'scheduled') return undefined
 if (result.state === 'failed' || result.state === 'uncertain') return t(('publishError_' + result.code) as TranslationKey)
 if (result.state === 'already_attempted') return t('errAlreadyAttempted')
 if (result.state === 'too_soon') return t('errTimeOutOfRange')
 if (result.state === 'not_configured') return t('publishingNotConfigured')
 return t('errHeld')
}

/**
 * The owner confirmed Publish now or Schedule. Authorizes the exact version shown in the
 * dialog (and for 'schedule' the chosen instant), then sends it to Facebook once.
 */
async function send(t: ServerTranslate, postId: string, expectedVersion: number, mode: PublishMode, instantIso: string | null): Promise<{ result?: PublishResult; error?: string }> {
 if (!getPublishingProvider()) return { error: t('publishingNotConfigured') }
 const identity = await getIdentity()
 if (!identity) return { error: t('signInAgain') }
 const { data: settings } = await identity.supabase.from('workspace_settings').select('timezone').eq('workspace_id', identity.user.id).maybeSingle()
 const { error } = await identity.supabase.rpc('authorize_post_publish', { p_post_id: postId, p_expected_version: expectedVersion, p_mode: mode, p_instant: instantIso, p_zone: settings?.timezone || 'UTC' })
 if (error) return { error: rpcError(t, error.message) }
 try {
  const result = await publishPost(defaultPublishDeps(), postId, mode)
  return { result, error: resultError(t, result) }
 } catch {
  return { error: t('errPublishUnavailable') }
 }
}

/** Publish now: the exact approved version is published immediately. */
export async function publishNow(postId: string, expectedVersion: number): Promise<{ result?: PublishResult; error?: string }> {
 const t = await serverTranslator()
 if (!validArgs(postId, expectedVersion)) return { error: t('errPostSave') }
 return send(t, postId, expectedVersion, 'now', null)
}

/** Schedule: sent to Facebook now as a scheduled post; Facebook publishes it at instantIso (15 minutes to 29 days ahead). */
export async function schedulePost(postId: string, expectedVersion: number, instantIso: string): Promise<{ result?: PublishResult; error?: string }> {
 const t = await serverTranslator()
 if (!validArgs(postId, expectedVersion) || typeof instantIso !== 'string' || Number.isNaN(Date.parse(instantIso))) return { error: t('errPostSave') }
 return send(t, postId, expectedVersion, 'schedule', new Date(instantIso).toISOString())
}

/** "I reviewed it, keep this text" for Brain-context holds. */
export async function resolveContextHolds(postId: string, expectedVersion: number): Promise<{ error?: string }> {
 const t = await serverTranslator()
 if (!validArgs(postId, expectedVersion)) return { error: t('errPostSave') }
 const identity = await getIdentity()
 if (!identity) return { error: t('signInAgain') }
 const { error } = await identity.supabase.rpc('resolve_context_holds', { p_post_id: postId, p_expected_version: expectedVersion })
 return error ? { error: rpcError(t, error.message) } : {}
}

/** After a failed or unconfirmed send: a new version, back to Approved. Never sends. */
export async function preparePostRetry(postId: string, expectedVersion: number): Promise<{ error?: string }> {
 const t = await serverTranslator()
 if (!validArgs(postId, expectedVersion)) return { error: t('errPostSave') }
 const identity = await getIdentity()
 if (!identity) return { error: t('signInAgain') }
 const { error } = await identity.supabase.rpc('prepare_post_retry', { p_post_id: postId, p_expected_version: expectedVersion })
 return error ? { error: rpcError(t, error.message) } : {}
}
