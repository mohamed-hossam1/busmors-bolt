import type { ClarificationCard } from './tools/director-tools'

/**
 * Structured outputs produced during a single Employee turn (Phase 3.5).
 *
 * The Orchestrator and Director capture their side effects (pending Brain
 * proposals, a Clarification Card, saved Deliverables, Calendar drafts) here so
 * the chat route can return them as structured payloads and persist them on the
 * assistant message metadata. The model's prose is never parsed to recover them.
 */

export interface BrainProposalCard {
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
  /** Version the proposal is based on (0 for a brand-new "add"). */
  baseVersion: number
  duplicate: boolean
  conflict: boolean
}

export interface DeliverableRef {
  deliverableId: string
  version: number
  created: boolean
  title: string
}

export interface DraftRef {
  postId: string
  version: number
  created: boolean
  proposedFor: string | null
}

export interface EmployeeRunState {
  brainProposals: BrainProposalCard[]
  clarification: ClarificationCard | null
  deliverables: DeliverableRef[]
  drafts: DraftRef[]
  /**
   * The Director's real prose for this turn, captured when the Orchestrator
   * delegates. The chat reply falls back to this verbatim so a tool-only
   * Orchestrator turn never swallows the Director's output behind a generic
   * "all done" message. Null when no Director ran or it produced no text.
   */
  directorReply: string | null
  /** True when the Director failed/stopped partially in this turn without prose. */
  directorFailed?: boolean
}

export function createEmployeeRunState(): EmployeeRunState {
  return {
    brainProposals: [],
    clarification: null,
    deliverables: [],
    drafts: [],
    directorReply: null,
    directorFailed: false,
  }
}

/** True when the turn produced at least one structured artifact. */
export function hasStructuredOutput(state: EmployeeRunState): boolean {
  return (
    state.brainProposals.length > 0 ||
    state.clarification !== null ||
    state.deliverables.length > 0 ||
    state.drafts.length > 0
  )
}