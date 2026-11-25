/** Client-safe mirror of the Director Clarification Card schema (Phase 3.5). */

export interface ClarificationQuestion {
  id: string
  question: string
  type: 'single' | 'multiple'
  options: string[]
  allowCustom: boolean
  notSure: boolean
}

export interface ClarificationCard {
  questions: ClarificationQuestion[]
}