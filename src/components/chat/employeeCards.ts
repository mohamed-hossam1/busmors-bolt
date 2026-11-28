import type { ClarificationCard } from './clarification-types'

/** Client-safe mirror of the server run-state card payloads (Phase 3.5). */

export type ProposalDecisionStatus = 'pending' | 'approved' | 'rejected'

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
  status?: ProposalDecisionStatus
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

/**
 * Returns true once the user has sent any message after the assistant message
 * carrying a Clarification Card, so the card stays locked across reloads and
 * conversation switches.
 */
export function isClarificationAnswered(
  messages: ReadonlyArray<{ role: string }>,
  assistantIndex: number,
): boolean {
  if (assistantIndex < 0 || assistantIndex >= messages.length - 1) return false
  for (let i = assistantIndex + 1; i < messages.length; i++) {
    if (messages[i]?.role === 'user') return true
  }
  return false
}

export type { ClarificationCard }