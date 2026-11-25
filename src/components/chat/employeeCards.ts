import type { ClarificationCard } from './clarification-types'

/** Client-safe mirror of the server run-state card payloads (Phase 3.5). */

export interface BrainProposalCardData {
  proposalId: string
  action: 'add' | 'edit' | 'delete'
  title: string
  summary: string
  category: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  properties: Record<string, unknown> | null
  source: string
  rationale: string
  baseVersion: number
  duplicate: boolean
  conflict: boolean
}

export interface DeliverableRefData {
  deliverableId: string
  version: number
  created: boolean
  title: string
}

export interface DraftRefData {
  postId: string
  version: number
  created: boolean
  proposedFor: string | null
  /** Enriched draft metadata (optional for backwards compatibility). */
  platform?: 'facebook' | 'instagram'
  caption?: string
  hashtags?: string
  visualBrief?: string
  /** A saved post draft is always 'draft' — never an auto-schedule/publish. */
  status?: string
}

export interface ChatCardMetadata {
  brainProposals?: BrainProposalCardData[]
  clarification?: ClarificationCard | null
  deliverables?: DeliverableRefData[]
  drafts?: DraftRefData[]
  traceId?: string
  status?: string
  stopReason?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: ChatCardMetadata
  error?: boolean
}

export interface ConversationSummary {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export type { ClarificationCard }