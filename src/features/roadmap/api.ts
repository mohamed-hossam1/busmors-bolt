import { supabase } from '../../lib/supabase'
import type { BrainNode } from '../../lib/types'
import { eligibleBrainFacts, planPrefill, planToRpc } from './discovery'
import type {
  DiscoveryDraft,
  DiscoveryGoal,
  DiscoveryLoad,
  DiscoveryQuestion,
  PlannedQuestion,
} from './types'

export async function loadDiscovery(): Promise<DiscoveryLoad> {
  const { data, error } = await supabase.rpc('load_discovery')
  if (error) throw error
  const loaded = (data ?? {}) as Partial<DiscoveryLoad>
  return { draft: loaded.draft ?? null, questions: loaded.questions ?? [] }
}

export async function loadDiscoveryFacts(): Promise<BrainNode[]> {
  const { data, error } = await supabase
    .from('brain_nodes')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return eligibleBrainFacts((data ?? []) as BrainNode[])
}

export async function saveDiscoveryDraft(
  goal: DiscoveryGoal,
  expectedVersion: number,
  contextRefs: unknown[] = []
): Promise<DiscoveryDraft> {
  const { data, error } = await supabase.rpc('save_discovery_draft', {
    p_goal: goal,
    p_expected_version: expectedVersion,
    p_context_refs: contextRefs,
  })
  if (error) throw error
  return data as DiscoveryDraft
}

export async function syncDiscoveryQuestions(
  draftId: string,
  expectedVersion: number,
  plan: PlannedQuestion[]
): Promise<DiscoveryLoad> {
  const { data, error } = await supabase.rpc('sync_discovery_questions', {
    p_draft_id: draftId,
    p_expected_version: expectedVersion,
    p_questions: planToRpc(plan),
    p_prefill: planPrefill(plan),
  })
  if (error) throw error
  const synced = (data ?? {}) as Partial<DiscoveryLoad>
  return { draft: synced.draft ?? null, questions: synced.questions ?? [] }
}

export async function saveDiscoveryAnswer(
  questionId: string,
  expectedVersion: number,
  status: string,
  value: { text?: string; choice?: string } | null,
  provenance: Record<string, unknown> = {}
): Promise<DiscoveryQuestion> {
  const { data, error } = await supabase.rpc('save_discovery_answer', {
    p_question_id: questionId,
    p_expected_version: expectedVersion,
    p_status: status,
    p_value: value,
    p_provenance: provenance,
  })
  if (error) throw error
  return data as DiscoveryQuestion
}

export async function planDiscoveryDraft(
  draftId: string,
  expectedVersion: number,
  openQuestionKeys: string[]
): Promise<DiscoveryDraft> {
  const { data, error } = await supabase.rpc('plan_discovery_draft', {
    p_draft_id: draftId,
    p_expected_version: expectedVersion,
    p_open_question_keys: openQuestionKeys,
  })
  if (error) throw error
  return data as DiscoveryDraft
}

export async function loadDiscoveryQuestion(questionId: string): Promise<DiscoveryQuestion> {
  const { data, error } = await supabase
    .from('discovery_questions')
    .select('*')
    .eq('id', questionId)
    .single()
  if (error) throw error
  return data as DiscoveryQuestion
}
