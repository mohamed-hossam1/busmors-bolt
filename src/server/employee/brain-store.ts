import 'server-only'
import type { BrainCategory } from '../../lib/types'

/**
 * Workspace-scoped Business Brain access for the employee runtime.
 *
 * This is a thin adapter over the existing Brain persistence (the `brain_nodes`
 * and `brain_proposals` tables and the `propose_brain_change` /
 * `decide_brain_proposal` RPCs). It does not duplicate persistence logic:
 *   - reads are scoped to the authenticated workspace (RLS + explicit filter),
 *   - proposals are created pending through the SECURITY DEFINER RPC and are
 *     approved/rejected later by the owner via the existing approval card.
 *
 * The store is always constructed from the authenticated server session's
 * workspace id; model-provided ids are never trusted.
 */

export interface BrainFact {
  id: string
  category: BrainCategory
  title: string
  summary: string
  properties: Record<string, unknown>
  version: number
  source: string
  sourceDetail: string | null
  updatedAt: string
}

export type BrainChangeAction = 'add' | 'edit' | 'delete'

export interface ProposeBrainChangeInput {
  action: BrainChangeAction
  nodeId?: string | null
  title: string
  summary: string
  category: BrainCategory
  properties?: Record<string, unknown> | null
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  source: string
  rationale: string
  sourceRefs?: string[]
  fingerprint?: string | null
}

export interface ProposeBrainChangeResult {
  proposalId: string
  status: 'pending'
  duplicate: boolean
  conflict: boolean
  baseVersion?: number
}

/** Minimal structural type for the authenticated Supabase client we use. */
interface BrainQuery {
  eq(column: string, value: unknown): BrainQuery
  order(column: string, options?: { ascending?: boolean }): BrainQuery
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>
}

interface BrainSupabase {
  from(table: string): {
    select(columns: string): BrainQuery
  }
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export interface BrainStore {
  /** Approved, current facts for the workspace, optionally filtered by query/category. */
  readApproved(query?: string, category?: BrainCategory, limit?: number): Promise<BrainFact[]>
  /** Create a pending add/edit/delete proposal. Never mutates approved facts. */
  proposeChange(input: ProposeBrainChangeInput): Promise<ProposeBrainChangeResult>
}

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

function toFact(row: unknown): BrainFact | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.id !== 'string') return null
  return {
    id: r.id,
    category: r.category as BrainCategory,
    title: typeof r.title === 'string' ? r.title : '',
    summary: typeof r.summary === 'string' ? r.summary : '',
    properties:
      r.properties && typeof r.properties === 'object' && !Array.isArray(r.properties)
        ? (r.properties as Record<string, unknown>)
        : {},
    version: typeof r.version === 'number' ? r.version : 1,
    source: typeof r.source === 'string' ? r.source : 'manual',
    sourceDetail: typeof r.source_detail === 'string' ? r.source_detail : null,
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : '',
  }
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

export function createBrainStore(supabase: BrainSupabase, workspaceId: string): BrainStore {
  return {
    async readApproved(query?: string, category?: BrainCategory, limit?: number): Promise<BrainFact[]> {
      const take = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)))
      // RLS already scopes to auth.uid(); the explicit workspace filter is
      // defence-in-depth and keeps the read correct even if RLS changes.
      const base = supabase.from('brain_nodes').select('*').eq('workspace_id', workspaceId).eq('status', 'approved')
      const filtered = category ? base.eq('category', category) : base
      const { data, error } = await filtered.order('updated_at', { ascending: false }).limit(take)
      if (error) throw new Error(`Business Brain could not be read: ${errorText(error)}`)

      const needle = query?.trim().toLowerCase()
      const facts: BrainFact[] = []
      for (const row of (data as unknown[]) ?? []) {
        const fact = toFact(row)
        if (!fact) continue
        // is_current === false marks retired/superseded rows; skip them.
        const isCurrent = (row as Record<string, unknown>).is_current
        if (isCurrent === false) continue
        if (needle && !`${fact.title} ${fact.summary}`.toLowerCase().includes(needle)) continue
        facts.push(fact)
      }
      return facts
    },

    async proposeChange(input: ProposeBrainChangeInput): Promise<ProposeBrainChangeResult> {
      const { data, error } = await supabase.rpc('propose_brain_change', {
        p_action: input.action,
        p_node_id: input.nodeId ?? null,
        p_title: input.title,
        p_summary: input.summary,
        p_category: input.category,
        p_properties: input.properties ?? null,
        p_old_values: input.oldValues ?? null,
        p_new_values: input.newValues ?? null,
        p_source: input.source,
        p_rationale: input.rationale,
        p_source_refs: input.sourceRefs ?? [],
        p_fingerprint: input.fingerprint ?? null,
      })
      if (error) throw new Error(`Brain proposal could not be created: ${errorText(error)}`)

      const r = (data ?? {}) as Record<string, unknown>
      return {
        proposalId: typeof r.proposalId === 'string' ? r.proposalId : '',
        status: 'pending',
        duplicate: r.duplicate === true,
        conflict: r.conflict === true,
        baseVersion: typeof r.baseVersion === 'number' ? r.baseVersion : undefined,
      }
    },
  }
}