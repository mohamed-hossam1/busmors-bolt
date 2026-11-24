import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ToolServices,
  BrainFactLike,
  BrainProposalInput,
  DeliverableLike,
  CalendarPostLike,
  TaskStatusLike,
  CreateDeliverableInput,
  CreatePostDraftInput,
  ExternalSearchResult,
  ExternalScrapeResult,
  ExternalComposioResult,
} from './tool-registry'
import { tavilySearch, exaSearch, firecrawlScrape, composioRun } from '../integrations/web-providers'

/**
 * Composio read-only allowlist. Only explicitly read-shaped, non-mutating actions
 * on authorized connections are permitted. Anything that writes, sends, publishes,
 * deletes, schedules or spends is rejected before dispatch. The transport also
 * refuses payment-required actions. If no allowlist is configured, Composio reads
 * are honestly reported unavailable rather than exposed as a stub that pretends.
 */
const COMPOSIO_WRITE_RE = /(send|publish|write|create|update|delete|remove|post|comment|upload|schedule|spend|pay|buy|order|message|dm|reply|edit|patch|put)/i
const COMPOSIO_READ_ALLOWLIST = (process.env.COMPOSIO_READ_ACTIONS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function composioActionAllowed(action: string): boolean {
  if (COMPOSIO_WRITE_RE.test(action)) return false
  if (COMPOSIO_READ_ALLOWLIST.length === 0) return false
  return COMPOSIO_READ_ALLOWLIST.includes(action)
}

/**
 * Server-side ToolServices backed by a workspace-scoped Supabase client.
 *
 * Every method runs through the caller's token-scoped client (RLS enforced) or,
 * for privileged task status, the same client. No method trusts a model-provided
 * workspace id — the client is already bound to the authenticated session.
 *
 * Persistence uses the existing deliverables/deliverable_versions/planned_posts
 * tables with stable task/output keys for idempotency, matching the pre-existing
 * schema. Brain changes go through brain_proposals (pending approval only).
 */

const BRAIN_SELECT = 'id, category, title, summary, verification_state'

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function createToolServices(supabase: SupabaseClient, workspaceId: string): ToolServices {
  return {
    async readBrain(query, limit) {
      let builder = supabase
        .from('brain_nodes')
        .select(BRAIN_SELECT)
        .eq('workspace_id', workspaceId)
        .eq('status', 'approved')
        .eq('approval_state', 'approved')
        .eq('is_current', true)
      const q = query.trim()
      if (q) builder = builder.or(`title.ilike.%${q}%,summary.ilike.%${q}%`)
      const { data, error } = await builder.order('updated_at', { ascending: false }).limit(limit)
      if (error) return []
      return (data ?? []).map((row) => ({
        id: String(row.id),
        category: text(row.category),
        title: text(row.title),
        summary: text(row.summary),
        verificationState: (row.verification_state as string | null) ?? null,
      })) as BrainFactLike[]
    },

    async proposeBrainChange(proposal: BrainProposalInput) {
      // SECURITY DEFINER RPC (direct table writes are revoked for authenticated).
      const { data, error } = await supabase.rpc('propose_brain_change', {
        p_change: proposal.change,
        p_category: proposal.category,
        p_title: proposal.title,
        p_proposed_value: proposal.proposedValue,
        p_previous_value: proposal.previousValue ?? null,
        p_source: proposal.source,
        p_rationale: proposal.rationale,
        p_node_id: proposal.nodeId ?? null,
      })
      if (error || !data) return { ok: false, error: error?.message ?? 'proposal could not be created' }
      const saved = data as { id?: string; status?: string }
      return { ok: true, id: saved.id, status: saved.status ?? 'pending' }
    },

    async readDeliverables(limit = 10) {
      const { data, error } = await supabase
        .from('deliverables')
        .select('id, title, type, version, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return []
      return (data ?? []).map((row) => ({
        id: String(row.id),
        title: text(row.title),
        type: text(row.type),
        version: Number(row.version ?? 1),
        createdAt: text(row.created_at),
      })) as DeliverableLike[]
    },

    async readCalendar(limit = 10) {
      const { data, error } = await supabase
        .from('planned_posts')
        .select('id, platform, caption, status, scheduled_for')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return []
      return (data ?? []).map((row) => ({
        id: String(row.id),
        platform: text(row.platform),
        caption: text(row.caption),
        status: text(row.status),
        scheduledFor: (row.scheduled_for as string | null) ?? null,
      })) as CalendarPostLike[]
    },

    async getTaskStatus(taskId) {
      if (!taskId) return { taskId: null, status: 'unknown', resultRefs: [], confirmed: false }
      const { data, error } = await supabase
        .from('tasks')
        .select('id, status, result_summary')
        .eq('workspace_id', workspaceId)
        .eq('id', taskId)
        .maybeSingle()
      if (error || !data) return { taskId, status: 'unknown', resultRefs: [], confirmed: false }
      const resultRefs: string[] = []
      const { data: results } = await supabase
        .from('task_results')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('task_id', taskId)
      for (const row of results ?? []) resultRefs.push(String((row as { id: string }).id))
      const status = text((data as { status?: string }).status, 'unknown')
      return {
        taskId,
        status,
        resultRefs,
        confirmed: status === 'completed' || status === 'partial',
      } as TaskStatusLike
    },

    async getProductKnowledge() {
      return [
        'Busmora Employee is an AI marketing assistant for Egyptian small businesses.',
        'Capabilities: marketing advice and strategy, market/competitor/audience research, content and creative drafting, performance analysis, and Business Brain knowledge.',
        'Simple answers appear in chat; substantial research, reports and strategies are saved to Deliverables; publishable posts become Calendar drafts for owner approval.',
        'Business Brain changes always require owner approval through approval cards.',
      ].join(' ')
    },

    async delegateToDirector(input) {
      // The actual task creation is performed by the gateway/runtime (which owns
      // the trace + conversation). This service is a thin adapter used when a
      // caller needs to submit directly; it delegates to enqueue_task.
      const idempotencyKey = input.idempotencyKey ?? crypto.randomUUID()
      const origin = { kind: 'employee_chat' }
      const { data, error } = await supabase.rpc('enqueue_task', {
        p_conversation_id: null,
        p_request: input.originalRequest,
        p_origin: origin,
        p_idempotency_key: idempotencyKey,
        p_trace_id: null,
      })
      if (error || !data) {
        // enqueue_task requires a conversation; if absent, report honest failure.
        return { ok: false, error: 'delegation requires an active conversation' }
      }
      return { ok: true, taskId: String((data as { id: string }).id) }
    },

    async createDeliverable(input: CreateDeliverableInput) {
      const { data, error } = await supabase.rpc('create_deliverable', {
        p_title: input.title,
        p_type: input.type,
        p_content: input.content,
        p_task_id: input.taskId ?? null,
        p_source_refs: input.sourceRefs ?? [],
        p_context_refs: input.contextRefs ?? [],
        p_limitations: input.limitations ?? [],
      })
      if (error || !data) return { ok: false, error: error?.message ?? 'deliverable could not be saved' }
      const saved = data as { id?: string; version?: number }
      return { ok: true, id: saved.id, version: saved.version ?? 1 }
    },

    async createPostDraft(input: CreatePostDraftInput) {
      const { data, error } = await supabase.rpc('create_post_draft', {
        p_platform: input.platform,
        p_caption: input.caption,
        p_hashtags: input.hashtags ?? '',
        p_proposed_time: input.proposedTime ?? null,
        p_task_id: input.taskId ?? null,
      })
      if (error || !data) return { ok: false, error: error?.message ?? 'post draft could not be saved' }
      const saved = data as { id?: string }
      return { ok: true, id: saved.id }
    },

    async webSearch(provider, query, maxResults, signal): Promise<ExternalSearchResult> {
      const opts = { maxResults: Math.max(1, Math.min(10, Math.trunc(maxResults))), signal: signal ?? new AbortController().signal }
      const result = provider === 'exa' ? await exaSearch(query, opts) : await tavilySearch(query, opts)
      if (!result.ok) return { ok: false, code: result.code, error: result.message }
      return { ok: true, hits: result.hits.map((h) => ({ url: h.url, title: h.title, snippet: h.snippet, score: h.score, publishedAt: h.publishedAt ?? null })) }
    },

    async scrapePage(url, signal): Promise<ExternalScrapeResult> {
      const result = await firecrawlScrape(url, { signal: signal ?? new AbortController().signal })
      if (!result.ok) return { ok: false, code: result.code, error: result.message }
      return { ok: true, title: result.title, markdown: result.markdown, publishedAt: result.publishedAt }
    },

    async composioRead(action, params, signal): Promise<ExternalComposioResult> {
      if (!composioActionAllowed(action)) {
        return { ok: false, code: 'forbidden', error: `Composio action ${action} is not an allowlisted read action.` }
      }
      const result = await composioRun(action, { params, signal: signal ?? new AbortController().signal })
      if (!result.ok) return { ok: false, code: result.code, error: result.message, paymentRequired: (result as { paymentRequired?: boolean }).paymentRequired }
      return { ok: true, data: result.data }
    },
  }
}