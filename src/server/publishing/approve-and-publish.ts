import type { PublishMode, PublishResult } from './publish-core'

/**
 * Shared, pure "approve → authorize → send" core for the human-approved Facebook
 * publishing flow (Phase 5 Part B).
 *
 * This module is deliberately free of `'use server'`, Next.js request globals and
 * any I/O of its own: every side effect is injected through `deps`, so the exact
 * same logic is unit-testable with mocks and reused by the server actions. The
 * owner has already reviewed the text; this only performs the two server-side
 * steps that follow that human gate:
 *
 *   1. transition the draft to `approved` (unless it already is), which bumps its
 *      version, then
 *   2. authorize the exact approved version for the chosen mode/instant, then
 *   3. hand the send to `publishPost` (via the injected `publish`).
 *
 * The approved draft is NEVER lost: if publishing is not configured, or the
 * Facebook Page is not connected, the post stays `approved` in the database and
 * an actionable error is returned so the owner can connect a Page and retry.
 */

export interface AuthorizePublishArgs {
  postId: string
  expectedVersion: number
  mode: PublishMode
  instantIso: string | null
  zone: string
}

export interface ApproveAndSendDeps {
  /** Step 1: transition draft/pending_approval/rejected -> approved; returns the bumped version. */
  updatePostStatus: (postId: string, expectedVersion: number) => Promise<{ version: number; error?: string }>
  /** Step 2: authorize the exact version/mode/instant (server RPC). */
  authorizePublish: (args: AuthorizePublishArgs) => Promise<{ error?: string }>
  /** Step 3: send via publishPost (never throws in production wiring). */
  publish: (postId: string, mode: PublishMode) => Promise<PublishResult>
  /** Whether a publishing provider is configured on this server. */
  providerConfigured: boolean
}

export interface ApproveAndSendInput {
  postId: string
  expectedVersion: number
  mode: PublishMode
  instantIso?: string | null
  timezone: string
  /** Live status when known; when it is already 'approved' step 1 is skipped. */
  currentStatus?: string
}

export interface ApproveAndSendResult {
  approved: boolean
  version?: number
  needsConnection?: boolean
  result?: PublishResult
  error?: string
}

/**
 * Approve (if needed) and send one post. See the module note for the guarantees.
 * Returns a plain result object; it never throws for expected/known failures.
 */
export async function approveAndSendPost(
  deps: ApproveAndSendDeps,
  input: ApproveAndSendInput,
): Promise<ApproveAndSendResult> {
  const { postId, expectedVersion, mode, timezone } = input
  const instantIso = input.instantIso ?? null

  // 1. Approve the text (Step 1) unless the live status already says approved.
  let approvedVersion = expectedVersion
  if (input.currentStatus !== 'approved') {
    const approved = await deps.updatePostStatus(postId, expectedVersion)
    if (approved.error) return { approved: false, needsConnection: false, error: approved.error }
    approvedVersion = approved.version
  }

  // 2. No provider: keep the approved draft, tell the owner publishing is off.
  if (!deps.providerConfigured) {
    return { approved: true, version: approvedVersion, needsConnection: false, error: 'publishingNotConfigured' }
  }

  // 3. Authorize the exact approved version for this mode/instant (Step 2).
  const auth = await deps.authorizePublish({ postId, expectedVersion: approvedVersion, mode, instantIso, zone: timezone })
  if (auth.error) {
    if (auth.error.includes('NO_CONNECTION')) {
      // The draft stays approved in the DB; the owner only needs to connect a Page.
      return { approved: true, version: approvedVersion, needsConnection: true, error: 'errNoConnection' }
    }
    return { approved: true, version: approvedVersion, needsConnection: false, error: auth.error }
  }

  // 4. Send exactly once (publishPost claims the version, then the provider sends).
  const result = await deps.publish(postId, mode)
  return { approved: true, version: approvedVersion, needsConnection: false, result }
}