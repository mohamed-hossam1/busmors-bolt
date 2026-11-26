import type { DirectorOutput } from '../employee/agents/director'
import type { HeavyTaskQuotaSummary } from '../../lib/types'

/**
 * Invite-only beta heavy-task quota gate (Phase 4).
 *
 * A "heavy task" is one substantive marketing execution: a Director chat turn
 * that produces a real artifact, or a roadmap generation. Every workspace gets a
 * small fixed allowance (default 6). The gate reserves a slot before the work
 * runs, then either settles it (consuming one unit of quota) or releases it
 * (refunding the slot) depending on the actual outcome.
 *
 * The Postgres RPCs (migration 20261126000000) are service_role-only and back
 * reserve/settle/release. `get_heavy_task_quota()` reads auth.uid() and therefore
 * does NOT work through the service_role admin client, so getQuota() reads the
 * tables directly with the admin client instead.
 *
 * This module is imported at runtime by the Orchestrator (for the pure
 * classifyDirectorOutcome helper), so it must stay free of any top-level
 * `server-only` dependency: the admin client is imported lazily inside the
 * factory, which is only ever invoked on the real server request path.
 */

export type HeavyTaskSource = 'director_chat' | 'roadmap_generate'

export interface HeavyTaskReserveInput {
  source: HeavyTaskSource
  conversationId?: string | null
  traceId?: string | null
}

export interface HeavyTaskReservation {
  allowed: boolean
  reason?: string
  runId?: string
  quota: HeavyTaskQuotaSummary
}

export type HeavyTaskReleaseReason = 'released_clarification' | 'released_failed'

export interface HeavyTaskGate {
  getQuota(): Promise<HeavyTaskQuotaSummary>
  reserve(input: HeavyTaskReserveInput): Promise<HeavyTaskReservation>
  settle(runId: string): Promise<HeavyTaskQuotaSummary>
  release(runId: string, reason: HeavyTaskReleaseReason): Promise<HeavyTaskQuotaSummary>
}

/**
 * Decide whether a Director run consumed a heavy-task slot or should be refunded.
 *
 * Order matters:
 *   - a quota-exhausted stub is never settled (defensive),
 *   - any persisted artifact (deliverable / draft / brain proposal) consumes,
 *   - a completed turn with real prose and no clarification consumes,
 *   - a clarification with no artifacts refunds (the task will resume later),
 *   - anything else (partial / empty / failed) refunds.
 *
 * A result that has BOTH a clarification and a deliverable consumes — the
 * artifacts check runs first.
 */
export function classifyDirectorOutcome(
  result: DirectorOutput,
): 'consume' | 'released_clarification' | 'released_failed' {
  if (result.quotaExhausted) return 'released_failed'
  if (result.deliverables.length > 0 || result.drafts.length > 0 || result.brainProposals.length > 0) {
    return 'consume'
  }
  if (result.status === 'completed' && !result.clarification && result.text.trim().length > 0) {
    return 'consume'
  }
  if (result.clarification !== null) return 'released_clarification'
  return 'released_failed'
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Map a reserve/settle/release jsonb snapshot to a HeavyTaskQuotaSummary. These
 * RPC payloads carry limit/used/reserved/remaining but no `activated` flag, so
 * activated defaults to true (the workspace clearly has access if the RPC ran).
 */
function toSummary(json: unknown): HeavyTaskQuotaSummary {
  const record = asRecord(json)
  return {
    activated: typeof record.activated === 'boolean' ? record.activated : true,
    limit: num(record.limit),
    used: num(record.used),
    reserved: num(record.reserved),
    remaining: num(record.remaining),
  }
}

/**
 * Build a HeavyTaskGate bound to a single workspace, backed by the privileged
 * (service_role) admin client. The admin client is imported lazily so importing
 * this module never pulls `server-only` into unit tests.
 */
export function createSupabaseHeavyTaskGate(workspaceId: string): HeavyTaskGate {
  const getAdmin = () => import('../supabase-admin').then((mod) => mod.createAdminClient())

  const getQuota = async (): Promise<HeavyTaskQuotaSummary> => {
    const admin = await getAdmin()
    const { data: access, error: accessError } = await admin
      .from('workspace_access')
      .select('heavy_tasks_limit,heavy_tasks_used')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (accessError) throw accessError
    if (!access) {
      return { activated: false, limit: 0, used: 0, reserved: 0, remaining: 0 }
    }
    const record = asRecord(access)
    const nowIso = new Date().toISOString()
    const { count, error: countError } = await admin
      .from('heavy_task_runs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'reserved')
      .gt('expires_at', nowIso)
    if (countError) throw countError
    const reserved = count ?? 0
    const limit = num(record.heavy_tasks_limit)
    const used = num(record.heavy_tasks_used)
    const remaining = Math.max(0, limit - used - reserved)
    return { activated: true, limit, used, reserved, remaining }
  }

  const reserve = async (input: HeavyTaskReserveInput): Promise<HeavyTaskReservation> => {
    const admin = await getAdmin()
    const runId = crypto.randomUUID()
    const { data, error } = await admin.rpc('reserve_heavy_task', {
      p_workspace_id: workspaceId,
      p_run_id: runId,
      p_source: input.source,
      p_conversation_id: input.conversationId ?? null,
      p_trace_id: input.traceId ?? null,
    })
    if (error) throw error
    const record = asRecord(data)
    const allowed = record.allowed === true
    const reservation: HeavyTaskReservation = {
      allowed,
      quota: toSummary(data),
    }
    if (allowed) reservation.runId = runId
    else if (typeof record.reason === 'string') reservation.reason = record.reason
    return reservation
  }

  const settle = async (runId: string): Promise<HeavyTaskQuotaSummary> => {
    const admin = await getAdmin()
    const { data, error } = await admin.rpc('settle_heavy_task', {
      p_workspace_id: workspaceId,
      p_run_id: runId,
    })
    if (error) throw error
    return toSummary(data)
  }

  const release = async (
    runId: string,
    reason: HeavyTaskReleaseReason,
  ): Promise<HeavyTaskQuotaSummary> => {
    const admin = await getAdmin()
    const { data, error } = await admin.rpc('release_heavy_task', {
      p_workspace_id: workspaceId,
      p_run_id: runId,
      p_reason: reason,
    })
    if (error) throw error
    return toSummary(data)
  }

  return { getQuota, reserve, settle, release }
}