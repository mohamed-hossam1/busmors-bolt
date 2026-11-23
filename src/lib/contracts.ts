// Shared command boundaries. UI state must not infer approvals or execution.
export type TaskStatus = 'queued' | 'running' | 'awaiting_input' | 'awaiting_approval' | 'partial' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
export type TaskOrigin =
  | { kind: 'direct'; conversationId: string }
  | { kind: 'wizard_question'; conversationId: string; draftId: string; questionId: string; researchLinkId: string }
  | { kind: 'roadmap_step'; conversationId: string; planId: string; planVersionId: string; stepId: string }
  | { kind: 'document'; conversationId: string; deliverableId: string; version: number }
export type AnswerStatus = 'unanswered' | 'answered' | 'unknown' | 'skipped' | 'not_applicable' | 'researching' | 'confirmed'
export type ContentRegister = 'english'
export interface ApiFailure { code: string; messageKey: string; details?: Record<string, unknown>; requestId?: string }

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Unable to save. Please try again.'
}
