import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callAi } from '../call-ai'
import type { BrainNode } from '../../lib/types'
import { eligibleBrainFacts, goalDefinition } from '../../features/roadmap/discovery'
import { normalizePlan, asRecord, asString } from '../../features/roadmap/plan-parse'

export type RevisionErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'STALE_VERSION'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_PLAN'
  | 'UNKNOWN'

export class RevisionError extends Error {
  code: RevisionErrorCode
  constructor(code: RevisionErrorCode, message: string) {
    super(message)
    this.name = 'RevisionError'
    this.code = code
  }
}

interface AdaptArgs {
  supabase: SupabaseClient
  workspaceId?: string
  token: string
  locale?: string
  signal?: AbortSignal
}

/**
 * Analyze an owner's free-text change request against the active roadmap and
 * persist a PROPOSED revision (a new immutable version awaiting owner approval).
 * Completed actions carry forward by stable step key; nothing is applied yet.
 */
export async function proposeRevisionFromRequest(
  args: AdaptArgs & {
    roadmapId: string
    baseVersionId: string
    expectedRoadmapVersion: number
    request: string
  },
): Promise<{ version: unknown; steps: number }> {
  const { supabase, token, locale, signal } = args
  const request = String(args.request ?? '').trim()
  if (request.length < 1 || request.length > 8000) {
    throw new RevisionError('INVALID_REQUEST', 'Describe the change you want in a sentence or two.')
  }

  const { data: roadmap, error: roadmapError } = await supabase
    .from('roadmaps')
    .select('id,goal,version,status,active_version_id,workspace_id')
    .eq('id', args.roadmapId)
    .maybeSingle()
  if (roadmapError) throw roadmapError
  if (!roadmap) throw new RevisionError('NOT_FOUND', 'This roadmap could not be found.')
  if (roadmap.status !== 'active') throw new RevisionError('INVALID_REQUEST', 'Only the active roadmap can be revised.')
  if (Number(roadmap.version) !== Number(args.expectedRoadmapVersion)) {
    throw new RevisionError('STALE_VERSION', 'The roadmap changed in another session. Reload, then try again.')
  }

  const { data: versionRow } = await supabase
    .from('roadmap_versions')
    .select('id,summary,context_refs')
    .eq('id', args.baseVersionId)
    .eq('workspace_id', roadmap.workspace_id ?? undefined)
    .maybeSingle()
  const { data: stepsRows } = await supabase
    .from('roadmap_steps')
    .select('step_key,title,status,position')
    .eq('plan_version_id', args.baseVersionId)
    .order('position', { ascending: true })

  const { data: factsRows } = await supabase
    .from('brain_nodes')
    .select('*')
    .eq('workspace_id', roadmap.workspace_id)
    .eq('status', 'approved')
    .eq('approval_state', 'approved')
    .eq('is_current', true)
    .limit(200)
  const facts = eligibleBrainFacts((factsRows ?? []) as BrainNode[])
  const contextRefs = facts.map((fact) => ({ nodeId: fact.id, version: fact.version }))
  const goal = goalDefinition(String(roadmap.goal), locale)

  const userPrompt = JSON.stringify({
    instruction: 'Produce the proposed roadmap revision described by the system prompt using only this data.',
    changeRequest: request,
    goal: { key: String(roadmap.goal), label: goal?.label ?? String(roadmap.goal) },
    currentSummary: versionRow?.summary ?? {},
    currentSteps: (stepsRows ?? []).map((step) => ({ key: step.step_key, title: step.title, status: step.status })),
    approvedFacts: facts.slice(0, 60).map((fact) => ({ category: fact.category, title: fact.title, summary: fact.summary.slice(0, 500) })),
    contextRefs,
  }).slice(0, 50000)

  const ai = await callAi({ operation: 'roadmap_revision', userPrompt, maxTokens: 4200, signal }, token)
  if (!ai.ok) {
    throw new RevisionError('PROVIDER_UNAVAILABLE', 'The Marketing Director is not available right now. Your roadmap is unchanged; try again.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(ai.text)
  } catch {
    throw new RevisionError('INVALID_PLAN', 'The Director returned an unreadable revision. Your roadmap is unchanged; try again.')
  }
  const plan = normalizePlan(parsed, goal?.label ?? String(roadmap.goal))
  if (plan.steps.length === 0) {
    throw new RevisionError('INVALID_PLAN', 'The Director returned no usable roadmap steps. Please try again.')
  }
  const { diff, ...planForSave } = plan

  const { data: saved, error: saveError } = await supabase.rpc('propose_roadmap_revision', {
    p_roadmap_id: roadmap.id,
    p_base_version_id: args.baseVersionId,
    p_expected_roadmap_version: Number(roadmap.version),
    p_request: request,
    p_plan: planForSave,
    p_diff: diff,
  })
  if (saveError || !saved) {
    const message = saveError && typeof saveError.message === 'string' ? saveError.message : ''
    if (message.includes('STALE_VERSION')) {
      throw new RevisionError('STALE_VERSION', 'The roadmap changed in another session. Reload, then try again.')
    }
    throw new RevisionError('UNKNOWN', 'The revision could not be saved. Your active roadmap is unchanged; try again.')
  }
  return saved as { version: unknown; steps: number }
}

/**
 * Evaluate a recorded check-in against the roadmap's objective, metrics and the
 * owner's reported results. The recommendation is advisory; the owner decides.
 */
export async function evaluateCheckin(
  args: AdaptArgs & { checkinId: string; expectedVersion: number },
): Promise<{ checkin: unknown }> {
  const { supabase, token, locale, signal } = args
  const { data: checkin, error } = await supabase
    .from('roadmap_checkins')
    .select('id,roadmap_id,roadmap_version_id,answers,version,workspace_id')
    .eq('id', args.checkinId)
    .maybeSingle()
  if (error) throw error
  if (!checkin) throw new RevisionError('NOT_FOUND', 'This check-in could not be found.')
  if (Number(checkin.version) !== Number(args.expectedVersion)) {
    throw new RevisionError('STALE_VERSION', 'This check-in changed. Reload, then evaluate again.')
  }

  const { data: roadmap } = await supabase.from('roadmaps').select('goal').eq('id', checkin.roadmap_id).maybeSingle()
  const { data: versionRow } = await supabase.from('roadmap_versions').select('summary').eq('id', checkin.roadmap_version_id).maybeSingle()
  const goal = goalDefinition(String(roadmap?.goal ?? ''), locale)

  const userPrompt = JSON.stringify({
    instruction: 'Evaluate the owner\'s reported progress against the roadmap using only this data.',
    goal: goal?.label ?? '',
    roadmapSummary: versionRow?.summary ?? {},
    checkinAnswers: checkin.answers ?? {},
  }).slice(0, 40000)

  const ai = await callAi({ operation: 'roadmap_checkin', userPrompt, maxTokens: 1600, signal }, token)
  if (!ai.ok) {
    throw new RevisionError('PROVIDER_UNAVAILABLE', 'The Marketing Director could not evaluate this check-in right now. Your answers are saved; try again.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(ai.text)
  } catch {
    throw new RevisionError('UNKNOWN', 'The evaluation could not be read. Your answers are saved; try again.')
  }
  const evaluation = asRecord(parsed)
  const recommendation = ['continue', 'adjust', 'pause', 'change_direction'].includes(asString(evaluation.recommendation))
    ? asString(evaluation.recommendation)
    : 'continue'

  const { data: updated, error: saveError } = await supabase.rpc('save_checkin_evaluation', {
    p_checkin_id: checkin.id,
    p_expected_version: Number(checkin.version),
    p_evaluation: evaluation,
    p_recommendation: recommendation,
  })
  if (saveError || !updated) {
    const message = saveError && typeof saveError.message === 'string' ? saveError.message : ''
    if (message.includes('STALE_VERSION')) {
      throw new RevisionError('STALE_VERSION', 'This check-in changed. Reload, then evaluate again.')
    }
    throw new RevisionError('UNKNOWN', 'The evaluation could not be saved. Your answers are safe; try again.')
  }
  return { checkin: updated }
}