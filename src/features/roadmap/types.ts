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
