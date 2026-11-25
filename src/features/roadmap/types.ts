import type { AnswerStatus } from '../../lib/contracts'
import type { BrainNode } from '../../lib/types'

export type DiscoveryGoal =
  | 'validate_idea'
  | 'win_first_customers'
  | 'grow_customers'
  | 'convert_inquiries'
  | 'unprofitable_marketing'
  | 'launch_offer'
  | 'increase_repeat_referral'
  | 'something_else'

export interface DiscoveryChallenge {
  key: DiscoveryGoal
  label: string
  description: string
  icon: string
}

export interface DiscoveryDraft {
  id: string
  workspace_id: string
  version: number
  goal: string
  status: 'draft' | 'planned' | 'archived'
  context_refs: unknown[]
  created_at: string
  updated_at: string
  /** Optional secondary challenge keys, persisted inside context_refs. */
  secondaryGoals?: DiscoveryGoal[]
  /** Optional free-text note for the "something_else" challenge. */
  somethingElseNote?: string
}

export interface DiscoveryAnswerValue {
  text?: string
  choice?: string
}

export type DirectorConfidence = 'low' | 'medium' | 'high'

export interface DirectorProposal {
  proposedAnswer: string
  rationale: string
  confidence: DirectorConfidence
  mode?: 'roadmap_quick_answer'
  askedAt?: string
}

export interface DiscoveryQuestionOption {
  value: string
  label: string
  detail?: string
  source?: 'standard' | 'brain'
  nodeId?: string
}

export interface DiscoveryQuestionSchema {
  label: string
  why: string
  type: 'choice' | 'text' | 'long_text'
  options?: DiscoveryQuestionOption[]
  allowOther?: boolean
  placeholder?: string
  /**
   * Whether the Director may use this question's answer as grounding for later
   * agent work. Fixed per question in configuration; never AI-generated.
   */
  askDirectorEligible?: boolean
  reuse?: {
    nodeId: string
    title: string
    version: number
    verificationState?: string
  }
}

/** Where a prefilled answer suggestion came from. */
export type PrefillSourceType = 'brain' | 'deliverable' | 'previous_roadmap'

/**
 * One AI-suggested answer for a fixed Discovery question. Suggestions are always
 * proposals: the owner must confirm them, and a confirmed answer is never
 * silently overwritten.
 */
export interface PrefillSuggestion {
  questionKey: string
  suggestedAnswer: string
  sourceType: PrefillSourceType
  sourceLabel: string
  isStale: boolean
  sourceId?: string
  rationale?: string
}

export interface DiscoveryQuestion {
  id: string
  workspace_id: string
  draft_id: string
  question_key: string
  position: number
  schema: DiscoveryQuestionSchema
  status: AnswerStatus
  value: DiscoveryAnswerValue | null
  provenance: Record<string, unknown>
  branch: string | null
  active: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface DiscoveryLoad {
  draft: DiscoveryDraft | null
  questions: DiscoveryQuestion[]
}

export interface DiscoveryPrefill {
  status: 'answered' | 'confirmed'
  value: DiscoveryAnswerValue
  provenance: Record<string, unknown>
}

export interface PlannedQuestion {
  question_key: string
  position: number
  branch: DiscoveryGoal
  schema: DiscoveryQuestionSchema
  prefill?: DiscoveryPrefill
}

export interface DiscoveryPlanContext {
  goal: string
  hasWebsite: boolean
  facts: BrainNode[]
  locale?: string
}

// --- Generated roadmap (Phase 3) ---

export type GeneratedResponsibleParty = 'owner' | 'director' | 'joint'
export type GeneratedActionKind = 'research' | 'analysis' | 'content' | 'owner_execution' | 'joint'
export type GeneratedPriority = 'high' | 'medium' | 'low'

export interface GeneratedAction {
  key: string
  title: string
  description: string
  businessRationale: string
  responsibleParty: GeneratedResponsibleParty
  actionKind: GeneratedActionKind
  priority: GeneratedPriority
  expectedOutput: string
  successCriteria: string
  dependencies: string[]
  linkedMetric: string | null
  evidence: string[]
  uncertainty: string
}

export interface GeneratedMilestone {
  key: string
  title: string
  description: string
  sequenceLabel: string
  actions: GeneratedAction[]
}

export interface GeneratedDiagnosis {
  perceivedProblem: string
  rootDiagnosis: string
  supportingEvidence: string[]
  hypotheses: string[]
  unknowns: string[]
}

export interface GeneratedPrimaryObjective {
  title: string
  outcome: string
  proposedTarget: string | null
  isProposedTarget: boolean
}

export interface GeneratedMetric {
  key: string
  name: string
  currentBaseline: string
  target: string
  isProposedTarget: boolean
  measurementMethod: string
  reviewTiming: string
}

export interface GeneratedPriorities {
  focusFirst: Array<{ title: string; why: string }>
  intentionallyDeferred: Array<{ title: string; why: string }>
}

export interface GeneratedRisk {
  kind: 'risk' | 'assumption'
  statement: string
  mitigation: string
}

export interface GeneratedReviewCadence {
  frequency: 'weekly' | 'biweekly' | 'monthly'
  intervalDays: number
  rationale: string
}

export interface GeneratedRoadmap {
  diagnosis: GeneratedDiagnosis
  primaryObjective: GeneratedPrimaryObjective
  metrics: GeneratedMetric[]
  priorities: GeneratedPriorities
  milestones: GeneratedMilestone[]
  risksAndAssumptions: GeneratedRisk[]
  reviewCadence: GeneratedReviewCadence
}

export interface RoadmapRecord {
  id: string
  workspace_id: string
  goal: string
  version: number
  status: string
  draft_id: string | null
  active_version_id: string | null
  review_cadence_days: number
  next_review_at: string | null
  updated_at: string
  created_at: string
}

export interface RoadmapVersionRecord {
  id: string
  roadmap_id: string
  version: number
  status: string
  summary: GeneratedRoadmap & Record<string, unknown>
  context_refs: unknown[]
  created_at: string
}

export type ExecutionState =
  | 'not_started'
  | 'in_progress'
  | 'waiting_for_owner'
  | 'waiting_for_director'
  | 'blocked'
  | 'completed'
  | 'skipped'

export interface RoadmapStepRecord {
  id: string
  roadmap_id: string
  plan_version_id: string
  step_key: string
  position: number
  title: string
  status: string
  milestone_key: string | null
  milestone_title: string | null
  priority: GeneratedPriority
  owner_role: GeneratedResponsibleParty
  action_kind: GeneratedActionKind
  success_criteria: string
  linked_metric: string | null
  /** Phase 4 execution columns (present after the execution migration). */
  execution_state?: ExecutionState | string | null
  conversation_id?: string | null
  linked_deliverable_id?: string | null
  linked_post_id?: string | null
  result_note?: string | null
  completed_at?: string | null
  attestation?: Record<string, unknown> | null
  dependencies?: string[] | null
}

export interface RoadmapStepActionRecord {
  id: string
  step_id: string
  action: string
  idempotency_key: string
  payload: Record<string, unknown>
  created_at: string
}

export interface LinkedDeliverableSummary {
  id: string
  title: string
  version: number
  type: string
}

export interface LinkedPostSummary {
  id: string
  platform: string
  status: string
  approvalState: string
  version: number
}

export interface StaleDependency {
  dependencyId: string
  nodeId: string
  nodeVersion: number
  currentVersion: number
  status: string
  isCurrent: boolean
  reason: string
}

export interface RoadmapLoad {
  roadmap: RoadmapRecord | null
  activeVersion: RoadmapVersionRecord | null
  steps: RoadmapStepRecord[]
  staleDependencies: StaleDependency[]
  /** Phase 4 execution data (optional until the execution migration is applied). */
  stepActions?: RoadmapStepActionRecord[]
  linkedDeliverables?: LinkedDeliverableSummary[]
  linkedPosts?: LinkedPostSummary[]
}
