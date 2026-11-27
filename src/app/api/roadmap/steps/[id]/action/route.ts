import { requireApiIdentity, apiError } from '@/server/auth'
import {
  createConversation,
  type ConversationSupabase,
} from '@/server/employee/conversation-store'
import { buildDirectorPrompt, buildRoadmapStepOrigin } from '@/server/roadmap/execution'

/**
 * Roadmap step action (Phase 4).
 *
 * POST /api/roadmap/steps/:id/action
 *
 * Body: { action, idempotencyKey, payload? }
 *
 * For a Director `run` on a research/analysis/content step this lazily creates a
 * persistent employee_conversations thread (titled with the step title), builds a
 * tailored Director handoff prompt, records the roadmap_step origin in
 * step_actions.payload via the RPC, and returns an employeeHref that opens the
 * thread with the prompt prefilled. All other actions simply delegate to the
 * SECURITY DEFINER perform_roadmap_step_action RPC.
 *
 * Authorization is derived strictly from the authenticated session; the client
 * never supplies a workspace id.
 */

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_ACTIONS = new Set([
  'run',
  'start',
  'complete',
  'attest',
  'block',
  'skip',
  'revisit',
  'link_output',
  'waiting_owner',
])

const DIRECTOR_KINDS = new Set(['research', 'analysis', 'content'])

type RouteContext = { params: Promise<{ id: string }> }

interface StepRow {
  id: string
  roadmap_id: string
  plan_version_id: string
  title: string
  objective: string | null
  expected_output: string | null
  success_criteria: string | null
  owner_role: string | null
  action_kind: string | null
  status: string | null
  conversation_id: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function errorStatus(error: unknown): number {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : ''
  if (message.includes('STALE_VERSION')) return 409
  if (message.includes('STEP_NOT_FOUND') || message.includes('CONVERSATION_NOT_FOUND') || message.includes('DELIVERABLE_NOT_FOUND') || message.includes('POST_NOT_FOUND')) return 404
  if (message.includes('NOT_AUTHENTICATED')) return 401
  if (message.includes('UNKNOWN_ACTION') || message.includes('IDEMPOTENCY_KEY_REQUIRED')) return 400
  return 500
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'A valid step id is required.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : ''
    const payload = asRecord(body.payload)

    if (!ALLOWED_ACTIONS.has(action)) {
      return Response.json({ error: 'Unknown action.' }, { status: 400 })
    }
    if (!UUID_RE.test(idempotencyKey)) {
      return Response.json({ error: 'A valid idempotency key is required.' }, { status: 400 })
    }

    const db = supabase as unknown as ConversationSupabase

    // For a Director run, resolve the step so we can lazily create a thread and
    // build a tailored prompt. RLS scopes this select to the caller's workspace.
    let conversationId: string | undefined
    let employeeHref: string | undefined

    if (action === 'run') {
      const { data: stepData, error: stepError } = await supabase
        .from('roadmap_steps')
        .select('id,roadmap_id,plan_version_id,title,objective,expected_output,success_criteria,owner_role,action_kind,status,conversation_id')
        .eq('id', id)
        .maybeSingle()
      if (stepError) throw stepError
      const step = (stepData ?? null) as StepRow | null
      if (!step) {
        return Response.json({ error: 'This roadmap step could not be found.' }, { status: 404 })
      }

      const actionKind = (step.action_kind ?? '') as string
      if (DIRECTOR_KINDS.has(actionKind)) {
        conversationId = step.conversation_id ?? undefined
        if (!conversationId) {
          const created = await createConversation(db, {
            id: crypto.randomUUID(),
            workspace_id: user.id,
            user_id: user.id,
            title: step.title,
          })
          conversationId = created.id
        }

        const promptLocale = payload.locale === 'ar' ? 'ar' : 'en'
        const directorPrompt = buildDirectorPrompt({
          actionKind: actionKind as 'research' | 'analysis' | 'content',
          stepTitle: step.title,
          objective: step.objective ?? '',
          expectedOutput: step.expected_output ?? '',
          successCriteria: step.success_criteria ?? '',
          locale: promptLocale,
        })
        payload.conversationId = conversationId
        payload.directorPrompt = directorPrompt
        payload.origin = buildRoadmapStepOrigin({
          roadmapId: step.roadmap_id,
          planVersionId: step.plan_version_id,
          stepId: step.id,
          actionKind: actionKind as 'research' | 'analysis' | 'content',
        })

        const query = new URLSearchParams({ conversationId, prompt: directorPrompt })
        employeeHref = `/employee?${query.toString()}`
      }
    }

    if (action === 'link_output' || action === 'waiting_owner') {
      const linkedDeliverableId =
        typeof payload.linkedDeliverableId === 'string' ? payload.linkedDeliverableId.trim() : ''
      const linkedPostId =
        typeof payload.linkedPostId === 'string' ? payload.linkedPostId.trim() : ''
      if (linkedDeliverableId && !UUID_RE.test(linkedDeliverableId)) {
        return Response.json({ error: 'Invalid deliverable UUID.' }, { status: 400 })
      }
      if (linkedPostId && !UUID_RE.test(linkedPostId)) {
        return Response.json({ error: 'Invalid post draft UUID.' }, { status: 400 })
      }
    }

    const { data, error } = await supabase.rpc('perform_roadmap_step_action', {
      p_step_id: id,
      p_action: action,
      p_idempotency_key: idempotencyKey,
      p_payload: payload,
    })
    if (error) {
      return Response.json({ error: error.message || 'The action could not be completed.' }, { status: errorStatus(error) })
    }

    const result = asRecord(data)
    if (action === 'run') {
      return Response.json({
        step: result.step ?? null,
        conversationId: conversationId ?? null,
        employeeHref: employeeHref ?? null,
      })
    }
    return Response.json({ step: result.step ?? null })
  } catch (error) {
    return apiError(error)
  }
}