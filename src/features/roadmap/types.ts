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
}

export interface DiscoveryAnswerValue {
  text?: string
  choice?: string
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
  reuse?: {
    nodeId: string
    title: string
    version: number
    verificationState?: string
  }
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

/** Structured, measurable roadmap produced by the Marketing Director. */
export interface RoadmapDiagnosis {
  whatIsHappening?: string
  ownerBelief?: string
  directorHypothesis?: string
  evidence?: string[]
  alternatives?: string[]
  confidence?: 'low' | 'medium' | 'high' | string
  unknowns?: string[]
}

export interface RoadmapObjective {
  statement?: string
  proposed?: boolean
  rationale?: string
}

export interface RoadmapMetric {
  name: string
  baseline?: string
  target?: string
  method?: string
  source?: string
  reviewTiming?: string
}

export interface RoadmapPriority {
  priority: string
  why?: string
  dependsOn?: string[]
}

export interface RoadmapMilestone {
  key?: string
  title: string
  objective?: string
  successCriteria?: string
}

export interface RoadmapRisk {
  risk: string
  assumption?: string
  mitigation?: string
}

export interface RoadmapReview {
  cadence?: string
  rationale?: string
}

export interface RoadmapPlanStep {
  key?: string
  title: string
  objective?: string
  rationale?: string
  evidence?: unknown[]
  uncertainty?: string
  responsibility?: 'owner' | 'system'
  executionMode?: 'director' | 'owner'
  inputs?: unknown[]
  dependencies?: string[]
  expectedOutput?: string
  checklist?: string[]
  effort?: string
  externalApproval?: string | null
  milestoneKey?: string
  successCriteria?: string
  priority?: 'critical' | 'high' | 'medium' | 'low' | string
  metric?: string
  dueHint?: string
}

export interface RoadmapPlan {
  title: string
  summary?: string
  uncertainty?: string
  goalLabel?: string
  diagnosis?: RoadmapDiagnosis
  objective?: RoadmapObjective
  metrics?: RoadmapMetric[]
  priorities?: RoadmapPriority[]
  milestones?: RoadmapMilestone[]
  risks?: RoadmapRisk[]
  review?: RoadmapReview
  steps: RoadmapPlanStep[]
  contextRefs?: { nodeId: string; version?: number }[]
}

export type RoadmapStepStatus =
  | 'ready'
  | 'running'
  | 'completed'
  | 'owner_reported'
  | 'skipped'
  | 'blocked'
  | 'inapplicable'

export interface RoadmapStepRecord {
  id: string
  workspace_id: string
  roadmap_id: string
  plan_version_id: string
  step_key: string
  position: number
  title: string
  objective: string
  rationale: string
  evidence: unknown[]
  uncertainty: string
  responsibility: 'owner' | 'system'
  execution_mode: 'director' | 'owner'
  inputs: unknown[]
  dependencies: string[]
  expected_output: string
  checklist: string[]
  effort: string
  external_approval: string | null
  status: RoadmapStepStatus
  attestation: Record<string, unknown> | null
  task_id: string | null
  milestone_key: string | null
  success_criteria: string
  priority: 'critical' | 'high' | 'medium' | 'low' | string
  metric: string
  due_hint: string
  owner_note: string
  completed_at: string | null
  created_at: string
}

export interface RoadmapRecord {
  id: string
  workspace_id: string
  goal: string
  version: number
  status: 'draft' | 'active' | 'archived' | 'rejected'
  draft_id: string | null
  active_version_id: string | null
  updated_at: string
  created_at: string
}

export interface RoadmapVersionSummary {
  title?: string
  summary?: string
  uncertainty?: string
  goalLabel?: string
  diagnosis?: RoadmapDiagnosis
  objective?: RoadmapObjective
  metrics?: RoadmapMetric[]
  priorities?: RoadmapPriority[]
  milestones?: RoadmapMilestone[]
  risks?: RoadmapRisk[]
  review?: RoadmapReview
}

export interface RoadmapVersionRecord {
  id: string
  roadmap_id: string
  version: number
  status: 'proposed' | 'active' | 'archived' | 'rejected'
  summary: RoadmapVersionSummary
  diff?: Record<string, unknown>
  context_refs: { nodeId: string; version?: number }[]
  created_at: string
}

export interface RoadmapStaleContext {
  nodeId: string
  nodeVersion: number
  title: string | null
  reason: string
}

export interface RoadmapLoad {
  roadmap: RoadmapRecord | null
  version: RoadmapVersionRecord | null
  steps: RoadmapStepRecord[]
  staleContext?: RoadmapStaleContext[]
}
