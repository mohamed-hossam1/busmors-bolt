// Shared command boundaries. UI state must not infer approvals or execution.
export type AnswerStatus = 'unanswered' | 'answered' | 'unknown' | 'skipped' | 'not_applicable' | 'researching' | 'confirmed'
export type ContentRegister = 'english'
export interface ApiFailure { code: string; messageKey: string; details?: Record<string, unknown>; requestId?: string }

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Unable to save. Please try again.'
}
