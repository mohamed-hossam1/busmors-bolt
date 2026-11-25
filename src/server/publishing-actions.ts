'use server'
import { getIdentity } from './auth'
import { getPublishingProvider } from './publishing/provider'
import { defaultPublishDeps, publishPost, type PublishMode, type PublishResult } from './publishing/publish-core'
import { approveAndSendPost } from './publishing/approve-and-publish'
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

export interface ApproveAndSendActionResult {
  approved: boolean
  version?: number
  needsConnection?: boolean
  result?: PublishResult
  error?: string
}

/** Translate an error the pure core already keyed ('errNoConnection'/'publishingNotConfigured') or a raw RPC code. */
function approveError(t: ServerTranslate, error: string): string {
  if (error === 'errNoConnection') return t('errNoConnection')
  if (error === 'publishingNotConfigured') return t('publishingNotConfigured')
  return rpcError(t, error)
}

/**
 * Shared wiring for the two owner-approved send actions. Authenticates, reads the
 * workspace timezone, and runs the pure `approveAndSendPost` core backed by the
 * real RPCs + publishPost. The approved draft is preserved on every failure path.
 */
async function runApprove(
  t: ServerTranslate,
  postId: string,
  expectedVersion: number,
  mode: PublishMode,
  instantIso: string | null,
  currentStatus?: string,
): Promise<ApproveAndSendActionResult> {
  const identity = await getIdentity()
  if (!identity) return { approved: false, error: t('signInAgain') }
  const { data: settings } = await identity.supabase
    .from('workspace_settings').select('timezone').eq('workspace_id', identity.user.id).maybeSingle()
  const timezone = (settings?.timezone as string | undefined) || 'UTC'

  const deps = {
    providerConfigured: getPublishingProvider() !== null,
    updatePostStatus: async (id: string, version: number): Promise<{ version: number; error?: string }> => {
      const { error } = await identity.supabase.rpc('update_post', {
        p_ids: [id], p_expected_version: version, p_caption: null, p_status: 'approved',
      })
      if (error) return { version, error: error.message }
      // Mirror updatePosts: record the owner approval (best effort; never lose the approval).
      await identity.supabase.from('audit_log').insert({
        workspace_id: identity.user.id, actor_id: identity.user.id, action: 'post_approved',
        entity_type: 'planned_post', details: { ids: [id], count: 1 },
      })
      const { data } = await identity.supabase.from('planned_posts').select('version').eq('id', id).maybeSingle()
      return { version: (data?.version as number | undefined) ?? version + 1 }
    },
    authorizePublish: async (args: { postId: string; expectedVersion: number; mode: PublishMode; instantIso: string | null; zone: string }) => {
      const { error } = await identity.supabase.rpc('authorize_post_publish', {
        p_post_id: args.postId, p_expected_version: args.expectedVersion,
        p_mode: args.mode, p_instant: args.instantIso, p_zone: args.zone,
      })
      return error ? { error: error.message } : {}
    },
    publish: async (id: string, publishMode: PublishMode): Promise<PublishResult> => publishPost(defaultPublishDeps(), id, publishMode),
  }

  let outcome
  try {
    outcome = await approveAndSendPost(deps, { postId, expectedVersion, mode, instantIso, timezone, currentStatus })
  } catch {
    return { approved: false, error: t('errPublishUnavailable') }
  }

  const error = outcome.error
    ? approveError(t, outcome.error)
    : outcome.result
      ? resultError(t, outcome.result)
      : undefined
  return { approved: outcome.approved, version: outcome.version, needsConnection: outcome.needsConnection, result: outcome.result, error }
}

/**
 * Approve (if needed) and schedule in one owner action: the exact text is sent to
 * Facebook now as a scheduled post (15 minutes to 29 days ahead). The draft stays
 * approved if no Page is connected or publishing is not configured.
 */
export async function approveAndSchedulePost(
  postId: string, expectedVersion: number, instantIso: string, currentStatus?: string,
): Promise<ApproveAndSendActionResult> {
  const t = await serverTranslator()
  if (!validArgs(postId, expectedVersion) || typeof instantIso !== 'string' || Number.isNaN(Date.parse(instantIso))) {
    return { approved: false, error: t('errPostSave') }
  }
  return runApprove(t, postId, expectedVersion, 'schedule', new Date(instantIso).toISOString(), currentStatus)
}

/**
 * Approve (if needed) and publish immediately in one owner action. The draft stays
 * approved if no Page is connected or publishing is not configured.
 */
export async function approveAndPublishPost(
  postId: string, expectedVersion: number, currentStatus?: string,
): Promise<ApproveAndSendActionResult> {
  const t = await serverTranslator()
  if (!validArgs(postId, expectedVersion)) return { approved: false, error: t('errPostSave') }
  return runApprove(t, postId, expectedVersion, 'now', null, currentStatus)
}
