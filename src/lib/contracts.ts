// Shared command boundaries. UI state must not infer approvals or execution.
export type TaskStatus = 'queued' | 'running' | 'awaiting_input' | 'awaiting_approval' | 'partial' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
export type TaskOrigin =
  | { kind: 'direct'; conversationId: string }
  | { kind: 'wizard_question'; conversationId: string; draftId: string; questionId: string; researchLinkId: string }
  | { kind: 'roadmap_step'; conversationId: string; planId: string; planVersionId: string; stepId: string }
  | { kind: 'document'; conversationId: string; deliverableId: string; version: number }
export type AnswerStatus = 'unanswered' | 'answered' | 'unknown' | 'skipped' | 'not_applicable' | 'researching' | 'confirmed'
export type ContentRegister = 'english'
export interface ScheduledTime { instant: string; zone: string; latenessAllowanceMinutes: number }
export interface VersionedCommand { expectedVersion: number; idempotencyKey: string }
export interface ApiFailure { code: string; messageKey: string; details?: Record<string, unknown>; requestId?: string }

export function isTimeZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true } catch { return false }
}

export function validateScheduledTime(value: unknown): value is ScheduledTime {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ScheduledTime>
  return typeof v.instant === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v.instant) && Number.isFinite(Date.parse(v.instant))
    && typeof v.zone === 'string' && isTimeZone(v.zone)
    && Number.isInteger(v.latenessAllowanceMinutes) && v.latenessAllowanceMinutes! >= 1 && v.latenessAllowanceMinutes! <= 1440
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function validateTaskOrigin(value: unknown): value is TaskOrigin {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (!isUuid(v.conversationId)) return false
  if (v.kind === 'direct') return true
  if (v.kind === 'wizard_question') return ['draftId', 'questionId', 'researchLinkId'].every(k => isUuid(v[k]))
  if (v.kind === 'roadmap_step') return ['planId', 'planVersionId', 'stepId'].every(k => isUuid(v[k]))
  if (v.kind === 'document') return isUuid(v.deliverableId) && Number.isInteger(v.version) && Number(v.version) >= 1
  return false
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Unable to save. Please try again.'
}
