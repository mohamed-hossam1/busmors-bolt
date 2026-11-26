import { supabase } from '../../lib/supabase'
import type { BrainNode } from '../../lib/types'
import { eligibleBrainFacts, planPrefill, planToRpc } from './discovery'
import type {
  DirectorProposal,
  DirectorRecommendation,
  DiscoveryDraft,
  DiscoveryLoad,
  DiscoveryQuestion,
  GeneratedPrimaryObjective,
  PlannedQuestion,
  PrefillSuggestion,
  RoadmapCheckinRecord,
  RoadmapLearningLogRecord,
  RoadmapLoad,
  RoadmapRevisionDiff,
  RoadmapRevisionRecord,
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

/**
 * Ask the server for AI prefill suggestions for the given challenge. Suggestions
 * are proposals only; the caller decides whether to surface them and the owner
 * always confirms. Returns an empty list on any failure so the wizard can fall
 * back to manual answering without blocking.
 */
export async function requestPrefill(
  goal: string,
  questionKeys?: string[],
  locale?: string,
): Promise<PrefillSuggestion[]> {
  try {
    const response = await fetch('/api/roadmap/prefill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, questionKeys, locale }),
    })
    if (!response.ok) return []
    const data = (await response.json()) as { suggestions?: PrefillSuggestion[] }
    return Array.isArray(data.suggestions) ? data.suggestions : []
  } catch {
    return []
  }
}

export async function requestDirectorSuggestion(
  draftId: string,
  questionId: string,
  locale?: string,
): Promise<{ mode: 'roadmap_quick_answer'; proposal: DirectorProposal }> {
  const response = await fetch('/api/roadmap/ask-director', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId, questionId, locale }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    mode?: unknown
    proposal?: unknown
    error?: unknown
  }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The Marketing Director could not answer right now.')
  }
  if (data.mode !== 'roadmap_quick_answer' || !data.proposal || typeof data.proposal !== 'object') {
    throw new Error('The Marketing Director returned an invalid suggestion.')
  }
  return { mode: 'roadmap_quick_answer', proposal: data.proposal as DirectorProposal }
}

/** Generate (or regenerate) the workspace's structured roadmap from Discovery. */
export async function generateRoadmap(draftId: string, locale?: string): Promise<RoadmapLoad> {
  const response = await fetch('/api/roadmap/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draftId, locale }),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<RoadmapLoad> & { error?: unknown; code?: unknown; quota?: unknown }
  if (!response.ok) {
    const err = new Error(typeof data.error === 'string' ? data.error : 'The roadmap could not be generated. Please retry.') as Error & { code?: string; quota?: unknown }
    err.code = typeof data.code === 'string' ? data.code : undefined
    err.quota = data.quota
    throw err
  }
  return {
    roadmap: data.roadmap ?? null,
    activeVersion: data.activeVersion ?? null,
    steps: Array.isArray(data.steps) ? data.steps : [],
    staleDependencies: Array.isArray(data.staleDependencies) ? data.staleDependencies : [],
    heavyTasks: data.heavyTasks ?? null,
  }
}

/** Load the workspace's active roadmap, if any. */
export async function loadActiveRoadmap(): Promise<RoadmapLoad> {
  const response = await fetch('/api/roadmap', { method: 'GET' })
  const data = (await response.json().catch(() => ({}))) as Partial<RoadmapLoad> & { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The roadmap could not be loaded.')
  }
  return {
    roadmap: data.roadmap ?? null,
    activeVersion: data.activeVersion ?? null,
    steps: Array.isArray(data.steps) ? data.steps : [],
    staleDependencies: Array.isArray(data.staleDependencies) ? data.staleDependencies : [],
    stepActions: Array.isArray(data.stepActions) ? data.stepActions : [],
    linkedDeliverables: Array.isArray(data.linkedDeliverables) ? data.linkedDeliverables : [],
    linkedPosts: Array.isArray(data.linkedPosts) ? data.linkedPosts : [],
    versions: Array.isArray(data.versions) ? data.versions : [],
    checkins: Array.isArray(data.checkins) ? data.checkins : [],
    pendingRevision: data.pendingRevision ?? null,
    learningLog: Array.isArray(data.learningLog) ? data.learningLog : [],
  }
}

// --- Phase 5: review, revision & learning log client ---

export interface CheckinInput {
  roadmapId: string
  locale?: string
  completedSummary?: string
  actualResults?: string
  whatDidntWork?: string
  blockers?: string
  businessChanges?: string
  nextReviewDays?: number
}

export interface CheckinResult {
  evaluation: {
    assessment: string
    recommendation: DirectorRecommendation
    rationale: string
    nextReviewDays: number
  }
  checkin: RoadmapCheckinRecord | null
  roadmap: RoadmapLoad['roadmap']
}

/** Evaluate and persist a progress check-in with the Marketing Director. */
export async function submitCheckin(input: CheckinInput): Promise<CheckinResult> {
  const response = await fetch('/api/roadmap/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<CheckinResult> & { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The check-in could not be saved.')
  }
  return {
    evaluation: data.evaluation as CheckinResult['evaluation'],
    checkin: data.checkin ?? null,
    roadmap: data.roadmap ?? null,
  }
}

export interface RevisionResult {
  revision: RoadmapRevisionRecord | null
  diff: RoadmapRevisionDiff
  rationale: string
}

/** Propose an ad-hoc roadmap revision (never applied without owner approval). */
export async function proposeRevision(roadmapId: string, ownerRequest: string, locale?: string): Promise<RevisionResult> {
  const response = await fetch('/api/roadmap/revisions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roadmapId, ownerRequest, locale }),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<RevisionResult> & { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The revision could not be proposed.')
  }
  return {
    revision: data.revision ?? null,
    diff: data.diff ?? { added: [], removedOrPostponed: [], modified: [], summaryChanges: [] },
    rationale: typeof data.rationale === 'string' ? data.rationale : '',
  }
}

/** Approve and apply a proposed revision (creates a new immutable version). */
export async function approveRevision(revisionId: string, expectedVersion: number): Promise<RoadmapLoad> {
  const response = await fetch(`/api/roadmap/revisions/${revisionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion }),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<RoadmapLoad> & { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The revision could not be applied.')
  }
  return normalizeLoad(data)
}

/** Reject a proposed revision. */
export async function rejectRevision(revisionId: string): Promise<void> {
  const response = await fetch(`/api/roadmap/revisions/${revisionId}/reject`, { method: 'POST' })
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: unknown }
    throw new Error(typeof data.error === 'string' ? data.error : 'The revision could not be rejected.')
  }
}

export interface LearningLogInput {
  roadmapId: string
  stepId?: string | null
  hypothesis: string
  experiment: string
  expectedOutcome?: string
  actualOutcome?: string
  learning: string
  decision?: string
}

/** Record a Roadmap-scoped learning entry. */
export async function createLearningLogEntry(input: LearningLogInput): Promise<RoadmapLearningLogRecord | null> {
  const response = await fetch('/api/roadmap/learning-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await response.json().catch(() => ({}))) as { entry?: RoadmapLearningLogRecord; error?: unknown }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The learning could not be saved.')
  }
  return data.entry ?? null
}

export type BrainPromotableCategory =
  | 'company_fact'
  | 'audience'
  | 'offering'
  | 'positioning'
  | 'channel'
  | 'brand_rule'
  | 'strategic_goal'

export interface PromoteLearningResult {
  proposalId: string
  status: 'pending'
  duplicate: boolean
  entry: RoadmapLearningLogRecord | null
}

/** Promote a learning to the Business Brain as a pending proposal. */
export async function promoteLearningToBrain(
  learningId: string,
  input: { category?: BrainPromotableCategory; title?: string; summary?: string } = {},
): Promise<PromoteLearningResult> {
  const response = await fetch(`/api/roadmap/learning-log/${learningId}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<PromoteLearningResult> & { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The learning could not be proposed to the Brain.')
  }
  return {
    proposalId: data.proposalId ?? '',
    status: 'pending',
    duplicate: data.duplicate === true,
    entry: data.entry ?? null,
  }
}

function normalizeLoad(data: Partial<RoadmapLoad>): RoadmapLoad {
  return {
    roadmap: data.roadmap ?? null,
    activeVersion: data.activeVersion ?? null,
    steps: Array.isArray(data.steps) ? data.steps : [],
    staleDependencies: Array.isArray(data.staleDependencies) ? data.staleDependencies : [],
    stepActions: Array.isArray(data.stepActions) ? data.stepActions : [],
    linkedDeliverables: Array.isArray(data.linkedDeliverables) ? data.linkedDeliverables : [],
    linkedPosts: Array.isArray(data.linkedPosts) ? data.linkedPosts : [],
    versions: Array.isArray(data.versions) ? data.versions : [],
    checkins: Array.isArray(data.checkins) ? data.checkins : [],
    pendingRevision: data.pendingRevision ?? null,
    learningLog: Array.isArray(data.learningLog) ? data.learningLog : [],
  }
}

export type RoadmapStepAction =
  | 'run'
  | 'start'
  | 'complete'
  | 'attest'
  | 'block'
  | 'skip'
  | 'revisit'
  | 'link_output'
  | 'waiting_owner'

export interface RoadmapStepActionResult {
  step: RoadmapLoad['steps'][number] | null
  conversationId?: string
  employeeHref?: string
}

/** Perform a single roadmap step lifecycle action (Phase 4). */
export async function performRoadmapStepAction(
  stepId: string,
  action: RoadmapStepAction,
  idempotencyKey: string,
  payload: Record<string, unknown> = {},
): Promise<RoadmapStepActionResult> {
  const response = await fetch(`/api/roadmap/steps/${stepId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, idempotencyKey, payload }),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<RoadmapStepActionResult> & { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The action could not be completed. Please retry.')
  }
  return {
    step: data.step ?? null,
    conversationId: typeof data.conversationId === 'string' ? data.conversationId : undefined,
    employeeHref: typeof data.employeeHref === 'string' ? data.employeeHref : undefined,
  }
}

/** Edit the primary objective of the active roadmap with optimistic concurrency. */
export async function updateRoadmapObjective(
  roadmapId: string,
  expectedVersion: number,
  primaryObjective: GeneratedPrimaryObjective,
): Promise<{ roadmap: RoadmapLoad['roadmap']; activeVersion: RoadmapLoad['activeVersion'] }> {
  const response = await fetch('/api/roadmap', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roadmapId, expectedVersion, primaryObjective }),
  })
  const data = (await response.json().catch(() => ({}))) as {
    roadmap?: RoadmapLoad['roadmap']
    activeVersion?: RoadmapLoad['activeVersion']
    error?: unknown
  }
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'The objective could not be saved.')
  }
  return { roadmap: data.roadmap ?? null, activeVersion: data.activeVersion ?? null }
}
