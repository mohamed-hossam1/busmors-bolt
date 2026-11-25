import type { AnswerStatus } from '../../lib/contracts'
import type {
  DiscoveryAnswerValue,
  PrefillSourceType,
  PrefillSuggestion,
} from './types'

/**
 * Deterministic merge of AI prefill suggestions into the fixed Discovery
 * questions.
 *
 * Source priority (highest first):
 *   1. Current owner-confirmed answer  (never overwritten — the question is locked)
 *   2. Approved Business Brain
 *   3. Previous roadmap answers
 *   4. Non-stale Deliverable (a suggestion requiring owner confirmation)
 *
 * The merge is pure and side-effect free: it never writes an answer. It only
 * decides which suggestions to surface, whether two sources conflict, and in
 * what order to show them. The owner always confirms.
 */

export interface MergeQuestionInput {
  questionKey: string
  status: AnswerStatus
  value: DiscoveryAnswerValue | null
  provenance?: Record<string, unknown>
}

export interface MergedSuggestion extends PrefillSuggestion {
  /** Lower number = higher priority (1 brain, 2 previous roadmap, 3 deliverable). */
  priority: number
}

export interface QuestionPrefillMerge {
  questionKey: string
  /** True when the owner already confirmed an answer; suggestions are withheld. */
  ownerLocked: boolean
  /** True when two sources disagree and both must be surfaced. */
  conflict: boolean
  suggestions: MergedSuggestion[]
}

export interface MergePrefillInput {
  questions: MergeQuestionInput[]
  suggestions: PrefillSuggestion[]
}

const SOURCE_PRIORITY: Record<PrefillSourceType, number> = {
  brain: 1,
  previous_roadmap: 2,
  deliverable: 3,
}

export function sourcePriority(type: PrefillSourceType): number {
  return SOURCE_PRIORITY[type] ?? 99
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * An owner-confirmed answer is one the owner explicitly confirmed, or an answer
 * the owner saved themselves (provenance.kind === 'owner'). A prefilled answer
 * (brain/deliverable/previous_roadmap) is NOT owner-confirmed and may still be
 * refined by a newer suggestion.
 */
export function isOwnerConfirmed(question: MergeQuestionInput): boolean {
  if (question.status === 'confirmed') return true
  if (question.status === 'answered' && question.provenance?.kind === 'owner') return true
  return false
}

/** Keep the highest-priority suggestion per distinct answer text. */
function dedupeSuggestions(suggestions: MergedSuggestion[]): MergedSuggestion[] {
  const sorted = [...suggestions].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return a.sourceLabel.localeCompare(b.sourceLabel)
  })
  const seen = new Set<string>()
  const out: MergedSuggestion[] = []
  for (const suggestion of sorted) {
    const key = normalizeAnswer(suggestion.suggestedAnswer)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(suggestion)
  }
  return out
}

export function mergePrefillSuggestions(input: MergePrefillInput): Record<string, QuestionPrefillMerge> {
  const grouped = new Map<string, MergedSuggestion[]>()
  for (const suggestion of input.suggestions) {
    if (!suggestion.questionKey || !suggestion.suggestedAnswer.trim()) continue
    const list = grouped.get(suggestion.questionKey) ?? []
    list.push({ ...suggestion, priority: sourcePriority(suggestion.sourceType) })
    grouped.set(suggestion.questionKey, list)
  }

  const result: Record<string, QuestionPrefillMerge> = {}
  for (const question of input.questions) {
    if (isOwnerConfirmed(question)) {
      result[question.questionKey] = {
        questionKey: question.questionKey,
        ownerLocked: true,
        conflict: false,
        suggestions: [],
      }
      continue
    }
    const suggestions = dedupeSuggestions(grouped.get(question.questionKey) ?? [])
    const distinctAnswers = new Set(suggestions.map((item) => normalizeAnswer(item.suggestedAnswer)))
    result[question.questionKey] = {
      questionKey: question.questionKey,
      ownerLocked: false,
      conflict: distinctAnswers.size > 1,
      suggestions,
    }
  }
  return result
}