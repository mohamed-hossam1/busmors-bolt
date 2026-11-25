import 'server-only'
import { z } from 'zod'
import { generateWithRole } from '../ai-gateway'
import {
  createTraceCollector,
  scheduleCollectorFlush,
  type TraceCollector,
} from '../observability'
import type { PrefillSourceType, PrefillSuggestion } from '../../features/roadmap/types'

/**
 * AI prefill for the fixed Discovery questions.
 *
 * The questions are fixed configuration (never AI-generated); the model only
 * proposes answers grounded in the owner's approved Business Brain, recent
 * non-stale Deliverables, and previous roadmap answers. Every suggestion is a
 * proposal the owner must confirm. The model call is a single structured request
 * through the Director role and is instrumented in admin_traces.
 */

export const PrefillSuggestionSchema = z.object({
  questionKey: z.string().min(1).max(64),
  suggestedAnswer: z.string().min(1).max(600),
  sourceType: z.enum(['brain', 'deliverable', 'previous_roadmap']),
  sourceLabel: z.string().min(1).max(300),
  isStale: z.boolean().default(false),
  sourceId: z.string().max(64).optional(),
  rationale: z.string().max(600).optional(),
})

export const PrefillResponseSchema = z.object({
  suggestions: z.array(PrefillSuggestionSchema).max(80),
})

export type ParsedPrefillSuggestion = z.infer<typeof PrefillSuggestionSchema>

export class PrefillValidationError extends Error {
  constructor(message = 'The prefill response did not match the expected schema.') {
    super(message)
    this.name = 'PrefillValidationError'
  }
}

export interface PrefillBrainNode {
  id: string
  title: string
  summary: string
  category: string
  version: number
}

export interface PrefillDeliverable {
  id: string
  title: string
  type: string
  version: number
  summary: string
  staleReason: string | null
  updatedAt: string
}

export interface PrefillPreviousAnswer {
  questionKey: string
  answer: string
  status: string
}

export interface PrefillQuestion {
  key: string
  label: string
  options: string[]
  askDirectorEligible: boolean
}

export interface RunPrefillInput {
  goal: string
  goalLabel: string
  questions: PrefillQuestion[]
  brain: PrefillBrainNode[]
  deliverables: PrefillDeliverable[]
  previousAnswers: PrefillPreviousAnswer[]
  locale?: string
}

export const DEFAULT_DELIVERABLE_MAX_AGE_DAYS = 90

/** A Deliverable is stale when it is explicitly marked stale or older than the max age. */
export function isDeliverableStale(
  deliverable: Pick<PrefillDeliverable, 'staleReason' | 'updatedAt'>,
  now: Date = new Date(),
  maxAgeDays: number = DEFAULT_DELIVERABLE_MAX_AGE_DAYS,
): boolean {
  if (deliverable.staleReason && deliverable.staleReason.trim()) return true
  const updated = Date.parse(deliverable.updatedAt)
  if (!Number.isFinite(updated)) return true
  const ageMs = now.getTime() - updated
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000
}

export function buildPrefillSystemPrompt(): string {
  return [
    'You are the Busmora Marketing Director preparing answer suggestions for a fixed Discovery questionnaire.',
    'The questions and their multiple-choice options are fixed. You must NOT invent questions.',
    'Propose an answer for a question ONLY when the provided Business Brain, Deliverables, or previous roadmap answers clearly support it.',
    'Return ONLY a JSON object of the form {"suggestions":[{"questionKey","suggestedAnswer","sourceType","sourceLabel","isStale","sourceId","rationale"}]}.',
    'sourceType must be one of: brain, deliverable, previous_roadmap.',
    'suggestedAnswer must be one of the question options when possible, otherwise a short free-text answer grounded in the evidence.',
    'sourceLabel must name the exact supporting item (e.g. the Brain node title or "Report: <title>").',
    'Set isStale=true for a Deliverable that is marked stale or older than the allowed age.',
    'Never suggest an answer that contradicts an owner-confirmed answer. Omit any question you cannot support with clear evidence.',
    'Do not include any prose outside the JSON object.',
  ].join(' ')
}

function formatOptions(options: string[]): string {
  return options.map((option) => `  - ${option}`).join('\n')
}

export function buildPrefillUserPrompt(input: RunPrefillInput): string {
  const lines: string[] = []
  lines.push(`Challenge: ${input.goalLabel} (${input.goal})`)
  lines.push('')
  lines.push('FIXED QUESTIONS (answer only these keys):')
  for (const question of input.questions) {
    lines.push(`- key="${question.key}" askDirectorEligible=${question.askDirectorEligible}`)
    lines.push(`  question: ${question.label}`)
    lines.push('  options:')
    lines.push(formatOptions(question.options))
  }

  lines.push('')
  lines.push('APPROVED BUSINESS BRAIN (sourceType="brain"):')
  if (input.brain.length === 0) lines.push('  (none)')
  for (const node of input.brain) {
    lines.push(`- id="${node.id}" version=${node.version} category=${node.category} title="${node.title}"`)
    lines.push(`  summary: ${node.summary}`)
  }

  lines.push('')
  lines.push('RECENT DELIVERABLES (sourceType="deliverable"):')
  if (input.deliverables.length === 0) lines.push('  (none)')
  for (const deliverable of input.deliverables) {
    const stale = isDeliverableStale(deliverable)
    lines.push(`- id="${deliverable.id}" version=${deliverable.version} type=${deliverable.type} stale=${stale} title="${deliverable.title}"`)
    lines.push(`  summary: ${deliverable.summary}`)
  }

  lines.push('')
  lines.push('PREVIOUS ROADMAP ANSWERS (sourceType="previous_roadmap"):')
  if (input.previousAnswers.length === 0) lines.push('  (none)')
  for (const answer of input.previousAnswers) {
    lines.push(`- questionKey="${answer.questionKey}" status=${answer.status} answer="${answer.answer}"`)
  }

  return lines.join('\n')
}

/** Strip optional ```json fences and parse the model output into validated suggestions. */
export function parsePrefillResponse(text: string): PrefillSuggestion[] {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new PrefillValidationError('The prefill response was not valid JSON.')
  }
  const result = PrefillResponseSchema.safeParse(parsed)
  if (!result.success) {
    throw new PrefillValidationError(`The prefill response failed validation: ${result.error.message}`)
  }
  return result.data.suggestions.map((suggestion) => ({
    questionKey: suggestion.questionKey,
    suggestedAnswer: suggestion.suggestedAnswer,
    sourceType: suggestion.sourceType as PrefillSourceType,
    sourceLabel: suggestion.sourceLabel,
    isStale: suggestion.isStale,
    sourceId: suggestion.sourceId,
    rationale: suggestion.rationale,
  }))
}

export interface PrefillGenerateResult {
  text: string
  provider?: string
  model?: string
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

export type PrefillGenerate = (options: {
  role: 'director'
  system: string
  prompt: string
}) => Promise<PrefillGenerateResult>

export interface RunPrefillDeps {
  generate?: PrefillGenerate
  collector?: TraceCollector
  now?: () => Date
}

export interface RunPrefillResult {
  suggestions: PrefillSuggestion[]
  provider: string | null
  model: string | null
}

const defaultGenerate: PrefillGenerate = (options) =>
  generateWithRole({
    role: options.role,
    system: options.system,
    prompt: options.prompt,
  })

/**
 * Run one Director-role model call and return validated suggestions. The call is
 * instrumented in the trace collector with secret redaction (handled by the
 * collector). Never throws on a model/validation failure to the caller's data:
 * a failure returns an empty suggestion list so the owner can answer manually.
 */
export async function runPrefill(
  input: RunPrefillInput,
  deps: RunPrefillDeps = {},
): Promise<RunPrefillResult> {
  const generate = deps.generate ?? defaultGenerate
  const now = deps.now ?? (() => new Date())
  const collector = deps.collector ?? createTraceCollector(
    { traceId: crypto.randomUUID(), request: 'roadmap_prefill', route: '/api/roadmap/prefill' },
  )

  const system = buildPrefillSystemPrompt()
  const prompt = buildPrefillUserPrompt(input)
  const startedAt = now().toISOString()

  try {
    const result = await generate({ role: 'director', system, prompt })
    collector.recordModel({
      operation: 'roadmap_prefill',
      provider: result.provider ?? null,
      model: result.model ?? null,
      startedAt,
      endedAt: now().toISOString(),
      usage: result.usage ?? null,
      input: { systemPrompt: system, userPrompt: prompt },
      outputText: result.text,
    })
    const suggestions = parsePrefillResponse(result.text)
    await scheduleCollectorFlush(collector)
    return { suggestions, provider: result.provider ?? null, model: result.model ?? null }
  } catch (error) {
    collector.recordModel({
      operation: 'roadmap_prefill',
      startedAt,
      endedAt: now().toISOString(),
      input: { systemPrompt: system, userPrompt: prompt },
      error: error instanceof Error ? error.message : String(error),
    })
    await scheduleCollectorFlush(collector)
    return { suggestions: [], provider: null, model: null }
  }
}