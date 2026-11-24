import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { callAi } from '../call-ai'
import type { BrainNode } from '../../lib/types'
import { answerLabel, eligibleBrainFacts, goalDefinition, localizeQuestionSchema } from '../../features/roadmap/discovery'
import { normalizePlan } from '../../features/roadmap/plan-parse'
import type { DiscoveryQuestion } from '../../features/roadmap/types'

export type RoadmapErrorCode =
  | 'NO_DISCOVERY'
  | 'NO_ANSWERS'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_PLAN'
  | 'STALE_VERSION'
  | 'UNKNOWN'

export class RoadmapGenerationError extends Error {
  code: RoadmapErrorCode
  constructor(code: RoadmapErrorCode, message: string) {
    super(message)
    this.name = 'RoadmapGenerationError'
    this.code = code
  }
}

interface GenerateArgs {
  supabase: SupabaseClient
  workspaceId: string
  token: string
  locale?: string
  signal?: AbortSignal
}

export interface RoadmapGenerationResult {
  plan: ReturnType<typeof normalizePlan>
  saved: { roadmapId: string; versionId: string; version: number; steps: number }
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Build a structured roadmap from the workspace's latest Discovery and persist it
 * through save_generated_roadmap. Facts come from the confirmed Discovery answers
 * and approved Brain nodes only; nothing is invented.
 */
export async function generateRoadmapFromDiscovery(args: GenerateArgs): Promise<RoadmapGenerationResult> {
  const { supabase, workspaceId, token, locale, signal } = args

  const { data: loaded, error: loadError } = await supabase.rpc('load_discovery')
  if (loadError) throw loadError
  const loadedData = rec(loaded)
  const draft = rec(loadedData.draft)
  if (!draft.id) {
    throw new RoadmapGenerationError('NO_DISCOVERY', 'Choose your business challenge and answer a few Discovery questions first.')
  }
  const questions = arr(loadedData.questions) as DiscoveryQuestion[]
  const active = questions.filter((question) => question.active)
  if (active.length === 0) {
    throw new RoadmapGenerationError('NO_ANSWERS', 'There are no active Discovery questions to build a roadmap from.')
  }

  const [factsResult, settingsResult] = await Promise.all([
    supabase
      .from('brain_nodes')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'approved')
      .eq('approval_state', 'approved')
      .eq('is_current', true)
      .limit(200),
    supabase.from('workspace_settings').select('country,currency,target_market,timezone').eq('workspace_id', workspaceId).maybeSingle(),
  ])
  if (factsResult.error) throw factsResult.error
  const facts = eligibleBrainFacts((factsResult.data ?? []) as BrainNode[])
  const goal = goalDefinition(String(draft.goal), locale)

  const answers = active.map((question) => {
    const schema = localizeQuestionSchema(question.question_key, question.schema, locale ?? 'en')
    const answered = isPositive(question.status)
    return {
      key: question.question_key,
      label: schema.label,
      status: question.status,
      answer: answered ? answerLabel(question.value, schema) || null : null,
      source: rec(question.provenance).kind === 'brain' ? 'brain' : 'owner',
    }
  })
  const approvedFacts = facts.map((fact) => ({
    category: fact.category,
    title: fact.title,
    summary: fact.summary.slice(0, 700),
    verificationState: fact.verification_state ?? 'unverified',
  }))
  const contextRefs = facts.map((fact) => ({ nodeId: fact.id, version: fact.version }))

  const userPrompt = JSON.stringify({
    instruction: 'Build the roadmap described by the system prompt using only this data.',
    goal: { key: String(draft.goal), label: goal?.label ?? String(draft.goal), description: goal?.description ?? '' },
    market: settingsResult.data ?? {},
    answers,
    approvedFacts,
    contextRefs,
  }).slice(0, 50000)

  const ai = await callAi({ operation: 'roadmap', userPrompt, maxTokens: 4200, signal }, token)
  if (!ai.ok) {
    if (ai.error === 'no_active_key' || ai.error === 'invalid_key' || ai.error === 'unauthorized') {
      throw new RoadmapGenerationError('PROVIDER_UNAVAILABLE', 'The Marketing Director is not available right now. Check the AI connection and try again.')
    }
    throw new RoadmapGenerationError('PROVIDER_UNAVAILABLE', 'The roadmap could not be generated right now. Your Discovery answers are safe; try again.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(ai.text)
  } catch {
    throw new RoadmapGenerationError('INVALID_PLAN', 'The Director returned an unreadable plan. Your answers are safe; try again.')
  }

  const plan = normalizePlan(parsed, goal?.label ?? String(draft.goal))
  if (plan.steps.length === 0) {
    throw new RoadmapGenerationError('INVALID_PLAN', 'The Director returned no usable roadmap steps. Please try again.')
  }
  plan.contextRefs = contextRefs

  const { data: saved, error: saveError } = await supabase.rpc('save_generated_roadmap', {
    p_draft_id: draft.id,
    p_goal: String(draft.goal),
    p_expected_draft_version: Number(draft.version ?? 0),
    p_plan: plan,
  })
  if (saveError || !saved) {
    const message = saveError && typeof saveError.message === 'string' ? saveError.message : ''
    if (message.includes('STALE_VERSION')) {
      throw new RoadmapGenerationError('STALE_VERSION', 'Your Discovery changed in another session. Reload, then generate the roadmap again.')
    }
    throw new RoadmapGenerationError('UNKNOWN', 'The roadmap was generated but could not be saved. Please try again.')
  }

  return { plan, saved: saved as RoadmapGenerationResult['saved'] }
}

function isPositive(status: string): boolean {
  return status === 'answered' || status === 'confirmed'
}