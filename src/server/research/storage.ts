import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResearchBudget, VisibleAgentEvent } from '../../features/research/contracts'
import { emptyUsage } from '../../features/research/contracts'
import type { LedgerBackend, Reservation, SettleResult } from '../../features/research/ledger/ledger'
import type { EventSink } from '../../features/research/director/director'

export class ResearchStorageError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ResearchStorageError'
    this.code = code
  }
}

function allowanceFrom(value: unknown, budget: ResearchBudget): ResearchBudget {
  const record = (value ?? {}) as Record<string, number>
  return {
    calls: Number(record.calls ?? budget.calls),
    pages: Number(record.pages ?? budget.pages),
    tokens: Number(record.tokens ?? budget.tokens),
    credits: Number(record.credits ?? budget.credits),
    seconds: budget.seconds,
  }
}

/** Ledger backend backed by the reserve/settle/release RPCs (one allowance row). */
export function createLedgerBackend(client: SupabaseClient): LedgerBackend {
  return {
    async reserve(input): Promise<Reservation> {
      const { data, error } = await client.rpc('reserve_provider_call', {
        p_task_id: input.taskId,
        p_call_id: input.callId,
        p_provider: input.provider,
        p_operation: input.operation,
        p_estimate: input.estimate,
      })
      if (error) {
        if (/INSUFFICIENT_ALLOWANCE/i.test(error.message)) throw new ResearchStorageError('INSUFFICIENT_ALLOWANCE', error.message)
        if (/POLICY_VIOLATION/i.test(error.message)) throw new ResearchStorageError('POLICY_VIOLATION', error.message)
        throw new ResearchStorageError(error.code ?? 'STORAGE_ERROR', error.message)
      }
      const record = data as { reservationId: string; allowance: Record<string, number> }
      const allowance = allowanceFrom(record.allowance, { calls: 0, pages: 0, tokens: 0, credits: 0, seconds: 0 })
      return { reservationId: record.reservationId, callId: input.callId, allowance }
    },
    async settle(input): Promise<SettleResult> {
      const { data, error } = await client.rpc('settle_provider_call', {
        p_task_id: input.taskId,
        p_call_id: input.callId,
        p_actual: input.usage,
      })
      if (error) throw new ResearchStorageError(error.code ?? 'STORAGE_ERROR', error.message)
      const record = data as { reservationId: string; settled: boolean; usage: Record<string, number>; allowance: Record<string, number> }
      return { reservationId: record.reservationId, settled: record.settled, usage: record.usage as SettleResult['usage'], allowance: allowanceFrom(record.allowance, { calls: 0, pages: 0, tokens: 0, credits: 0, seconds: 0 }) }
    },
    async release(input): Promise<void> {
      const { error } = await client.rpc('release_provider_call', { p_task_id: input.taskId, p_call_id: input.callId })
      if (error) throw new ResearchStorageError(error.code ?? 'STORAGE_ERROR', error.message)
    },
  }
}

/** Persist every visible agent event exactly as the Canvas will render it. */
export function createEventSink(client: SupabaseClient, taskId: string, runId: string): EventSink & { events: VisibleAgentEvent[] } {
  const events: VisibleAgentEvent[] = []
  return {
    events,
    async append(event): Promise<VisibleAgentEvent> {
      const seq = events.length
      const { data, error } = await client.rpc('record_research_event', {
        p_task_id: taskId,
        p_run_id: runId,
        p_instance_id: event.instanceId,
        p_parent_instance_id: event.parentInstanceId,
        p_correlation_id: event.correlationId,
        p_seq: seq,
        p_event_type: event.type,
        p_agent_id: event.agentId,
        p_agent_role: event.agentRole,
        p_label: event.label,
        p_status: event.status,
        p_public_message: event.publicMessage,
        p_parameters: event.parametersRedacted,
        p_source_ids: event.sourceIds,
        p_consumption: event.consumption,
        p_failure_reason: event.failureReason,
        p_started_at: event.startedAt,
        p_ended_at: event.endedAt,
      })
      if (error) throw new ResearchStorageError(error.code ?? 'STORAGE_ERROR', error.message)
      const stored: VisibleAgentEvent = { ...event, id: String(data ?? `${seq}`), seq }
      events.push(stored)
      return stored
    },
  }
}

export interface SavedResearch {
  taskId: string
  documentId: string | null
  reportId: string
  sourceIds: string[]
  claimIds: string[]
  partial: boolean
}

/** Persist report, sources, claims, deliverable and task result in one transaction. */
export async function saveResearchResult(
  client: SupabaseClient,
  taskId: string,
  runId: string,
  result: Record<string, unknown>,
  partial: boolean,
): Promise<SavedResearch> {
  const { data, error } = await client.rpc('save_research_result', {
    p_task_id: taskId,
    p_run_id: runId,
    p_result: result,
    p_partial: partial,
  })
  if (error) throw new ResearchStorageError(error.code ?? 'STORAGE_ERROR', error.message)
  const record = data as Record<string, unknown>
  return {
    taskId: String(record.taskId ?? taskId),
    documentId: (record.documentId as string | null) ?? null,
    reportId: String(record.reportId ?? ''),
    sourceIds: (record.sourceIds as string[]) ?? [],
    claimIds: (record.claimIds as string[]) ?? [],
    partial: Boolean(record.partial),
  }
}

export interface ResearchProposalInput {
  reportId: string
  proposalKind: string
  title: string
  summary: string
  summaryAr: string | null
  diff: Record<string, unknown>
  evidenceIds: string[]
  sourceUrls: string[]
  confidence: string
  geography: string | null
  validFrom: string | null
  validUntil: string | null
}

/** Analyzer output is stored as pending proposals, never as brain nodes. */
export async function storeResearchProposals(client: SupabaseClient, workspaceId: string, proposals: ResearchProposalInput[]): Promise<{ inserted: number; pending: number }> {
  if (!proposals.length) return { inserted: 0, pending: 0 }
  const { data, error } = await client
    .from('research_proposals')
    .insert(proposals.map(proposal => ({
      workspace_id: workspaceId,
      report_id: proposal.reportId,
      proposal_kind: proposal.proposalKind,
      title: proposal.title,
      summary: proposal.summary,
      summary_ar: proposal.summaryAr,
      diff: proposal.diff,
      evidence_ids: proposal.evidenceIds,
      source_urls: proposal.sourceUrls,
      confidence: proposal.confidence,
      geography: proposal.geography,
      valid_from: proposal.validFrom,
      valid_until: proposal.validUntil,
      status: 'pending',
    })), { count: 'exact' })
    .select('id')
  if (error) throw new ResearchStorageError(error.code ?? 'STORAGE_ERROR', error.message)
  const inserted = Array.isArray(data) ? data.length : proposals.length
  return { inserted, pending: inserted }
}

/** Loading the brief allowance so the Director starts from the persisted ledger. */
export async function loadAllowance(client: SupabaseClient, mode: ResearchBudget): Promise<ResearchBudget> {
  const { data, error } = await client.from('free_tier_allowance').select('*').maybeSingle()
  if (error) throw new ResearchStorageError(error.code ?? 'STORAGE_ERROR', error.message)
  if (!data) return mode
  return {
    calls: Number((data as Record<string, unknown>).calls_limit ?? 0) - Number((data as Record<string, unknown>).calls_used ?? 0),
    pages: Number((data as Record<string, unknown>).pages_limit ?? 0) - Number((data as Record<string, unknown>).pages_used ?? 0),
    tokens: Number((data as Record<string, unknown>).tokens_limit ?? 0) - Number((data as Record<string, unknown>).tokens_used ?? 0),
    credits: Number((data as Record<string, unknown>).credits_limit ?? 0) - Number((data as Record<string, unknown>).credits_used ?? 0),
    seconds: mode.seconds,
  }
}

export { emptyUsage }