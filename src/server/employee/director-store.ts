import 'server-only'
import type { Deliverable } from '../../lib/types'

/**
 * Workspace-scoped persistence adapters for the Director (Phase 3).
 *
 * These are thin adapters over the EXISTING Deliverables and Calendar tables and
 * RPCs. They do not duplicate persistence logic or invent new storage:
 *   - deliverables are created/versioned through create_or_version_deliverable
 *     (immutable versions, idempotent create), and read through list_deliverables;
 *   - post drafts are created/updated through create_or_update_post_draft, which
 *     only ever writes drafts with a PROPOSED time — never a schedule or publish.
 *
 * Every store is constructed from the authenticated session's workspace id;
 * model-provided ids are never trusted for authorization.
 */

export type DeliverableType = Deliverable['type']

export interface CreateOrVersionDeliverableInput {
  deliverableId?: string | null
  expectedVersion?: number | null
  title: string
  type: DeliverableType
  content: string
  sourceRefs?: unknown[]
  contextRefs?: unknown[]
  limitations?: unknown[]
  idempotencyKey?: string | null
}

export interface CreateOrVersionDeliverableResult {
  deliverableId: string
  version: number
  created: boolean
}

export interface DeliverableSummary {
  id: string
  title: string
  type: DeliverableType
  version: number
  created_at: string
}

export interface CreateOrUpdatePostDraftInput {
  postId?: string | null
  expectedVersion?: number | null
  platform: 'facebook' | 'instagram'
  caption: string
  hashtags?: string
  /** AI-suggested time (a proposal, never a schedule). */
  proposedFor?: string | null
  origin?: Record<string, unknown>
  visualBrief?: string
  idempotencyKey?: string | null
}

export interface CreateOrUpdatePostDraftResult {
  postId: string
  version: number
  created: boolean
  proposedFor: string | null
}

export interface CalendarDraftSummary {
  id: string
  platform: 'facebook' | 'instagram'
  caption: string
  status: string
  proposed_for: string | null
  version: number
}

export interface WorkspaceContext {
  companyName: string | null
  settings: Record<string, unknown> | null
}

interface Query {
  eq(column: string, value: unknown): Query
  order(column: string, options?: { ascending?: boolean }): Query
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>
}

interface SupabaseLike {
  from(table: string): {
    select(columns: string): Query
  }
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export interface DeliverableStore {
  createOrVersion(input: CreateOrVersionDeliverableInput): Promise<CreateOrVersionDeliverableResult>
  readRecent(limit?: number): Promise<DeliverableSummary[]>
}

export interface CalendarStore {
  createOrUpdateDraft(input: CreateOrUpdatePostDraftInput): Promise<CreateOrUpdatePostDraftResult>
  readDrafts(limit?: number): Promise<CalendarDraftSummary[]>
}

export interface WorkspaceContextStore {
  read(): Promise<WorkspaceContext>
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export function createDeliverableStore(supabase: SupabaseLike, workspaceId: string): DeliverableStore {
  return {
    async createOrVersion(input) {
      const { data, error } = await supabase.rpc('create_or_version_deliverable', {
        p_deliverable_id: input.deliverableId ?? null,
        p_expected_version: input.expectedVersion ?? null,
        p_title: input.title,
        p_type: input.type,
        p_content: input.content,
        p_source_refs: input.sourceRefs ?? [],
        p_context_refs: input.contextRefs ?? [],
        p_limitations: input.limitations ?? [],
        p_idempotency_key: input.idempotencyKey ?? null,
      })
      if (error) throw new Error(`Deliverable could not be saved: ${errorText(error)}`)
      const r = asRecord(data)
      return {
        deliverableId: typeof r.deliverableId === 'string' ? r.deliverableId : '',
        version: typeof r.version === 'number' ? r.version : 1,
        created: r.created === true,
      }
    },

    async readRecent(limit) {
      const take = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)))
      const { data, error } = await supabase
        .from('deliverables')
        .select('id,title,type,version,created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(take)
      if (error) throw new Error(`Deliverables could not be read: ${errorText(error)}`)
      return ((data as unknown[]) ?? []).map((row) => {
        const r = asRecord(row)
        return {
          id: String(r.id ?? ''),
          title: typeof r.title === 'string' ? r.title : '',
          type: (r.type as DeliverableType) ?? 'general',
          version: typeof r.version === 'number' ? r.version : 1,
          created_at: typeof r.created_at === 'string' ? r.created_at : '',
        }
      })
    },
  }
}

export function createCalendarStore(supabase: SupabaseLike, workspaceId: string): CalendarStore {
  return {
    async createOrUpdateDraft(input) {
      const { data, error } = await supabase.rpc('create_or_update_post_draft', {
        p_post_id: input.postId ?? null,
        p_expected_version: input.expectedVersion ?? null,
        p_platform: input.platform,
        p_caption: input.caption,
        p_hashtags: input.hashtags ?? '',
        p_proposed_for: input.proposedFor ?? null,
        p_origin: input.origin ?? {},
        p_visual_brief: input.visualBrief ?? '',
        p_idempotency_key: input.idempotencyKey ?? null,
      })
      if (error) throw new Error(`Post draft could not be saved: ${errorText(error)}`)
      const r = asRecord(data)
      return {
        postId: typeof r.postId === 'string' ? r.postId : '',
        version: typeof r.version === 'number' ? r.version : 1,
        created: r.created === true,
        proposedFor: typeof r.proposedFor === 'string' ? r.proposedFor : null,
      }
    },

    async readDrafts(limit) {
      const take = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit ?? DEFAULT_LIMIT)))
      const { data, error } = await supabase
        .from('planned_posts')
        .select('id,platform,caption,status,proposed_for,version')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(take)
      if (error) throw new Error(`Calendar drafts could not be read: ${errorText(error)}`)
      return ((data as unknown[]) ?? []).map((row) => {
        const r = asRecord(row)
        return {
          id: String(r.id ?? ''),
          platform: (r.platform as 'facebook' | 'instagram') ?? 'facebook',
          caption: typeof r.caption === 'string' ? r.caption : '',
          status: typeof r.status === 'string' ? r.status : 'draft',
          proposed_for: typeof r.proposed_for === 'string' ? r.proposed_for : null,
          version: typeof r.version === 'number' ? r.version : 1,
        }
      })
    },
  }
}

export function createWorkspaceContextStore(
  supabase: SupabaseLike,
  workspaceId: string,
): WorkspaceContextStore {
  return {
    async read() {
      const [settingsRes, brainRes] = await Promise.all([
        supabase.from('workspace_settings').select('*').eq('workspace_id', workspaceId).limit(1),
        supabase.from('brain_nodes').select('title').eq('workspace_id', workspaceId).eq('status', 'approved').limit(1),
      ])
      const settingsRows = (settingsRes.data as unknown[]) ?? []
      const settings = settingsRows.length > 0 ? asRecord(settingsRows[0]) : null
      const brainRows = (brainRes.data as unknown[]) ?? []
      const firstBrain = brainRows.length > 0 ? asRecord(brainRows[0]) : null
      return {
        companyName: firstBrain && typeof firstBrain.title === 'string' ? firstBrain.title : null,
        settings,
      }
    },
  }
}