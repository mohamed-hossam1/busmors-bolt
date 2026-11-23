import { supabase } from '../../lib/supabase'
import type { BrainNode } from '../../lib/types'
import { eligibleBrainFacts, planPrefill, planToRpc } from './discovery'
import type {
  DiscoveryDraft,
  DiscoveryLoad,
  DiscoveryQuestion,
  PlannedQuestion,
  RoadmapLoad,
  RoadmapStepStatus,
} from './types'

async function roadmapRequest<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('unauthorized')
  const response = await fetch('/api/roadmap', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : 'roadmap_request_failed') as Error & { code?: string }
    error.code = typeof data.code === 'string' ? data.code : undefined
    throw error
  }
  return data as T
}

export async function loadActiveRoadmap(): Promise<RoadmapLoad> {
  const loaded = await roadmapRequest<Partial<RoadmapLoad>>({ action: 'load' })
  return { roadmap: loaded.roadmap ?? null, version: loaded.version ?? null, steps: loaded.steps ?? [] }
}

export interface RoadmapGenerateResult {
  plan: unknown
  saved: { roadmapId: string; versionId: string; version: number; steps: number }
}

export async function generateRoadmap(): Promise<RoadmapGenerateResult> {
  return roadmapRequest<RoadmapGenerateResult>({ action: 'generate' })
}

export async function setRoadmapStepStatus(
  stepId: string,
  status: RoadmapStepStatus,
  attestation: Record<string, unknown> = {},
): Promise<void> {
  await roadmapRequest<unknown>({ action: 'setStepStatus', stepId, status, attestation })
}

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
  goal: string,
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
