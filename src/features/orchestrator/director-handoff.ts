// Director handoff planning.
//
// The Orchestrator decides a request is an execution task. This module turns that
// decision into a Director handoff WITHOUT redesigning the Director: it produces a
// pre-seeded task checkpoint (phase "generate") so the existing executor runs the
// detected intent directly instead of re-routing, and it maps the intent to the
// tasks.type the pipeline already understands.
//
// The Director (research runner, content/campaign/diagnosis generation) stays a
// black box. This module only prepares the handoff.

import type { ResearchMode } from '../research/contracts'
import type { RouteDecision, TaskCheckpoint } from '../tasks/types'
import type { DirectorIntent, OrchestratorDecision } from './contracts'

/** Execution intents the Director actually performs work for. */
const EXECUTION_INTENTS: ReadonlySet<DirectorIntent> = new Set<DirectorIntent>([
  'marketing_research',
  'content_creation',
  'campaign_planning',
  'performance_diagnosis',
])

export function isExecutionIntent(intent: DirectorIntent): boolean {
  return EXECUTION_INTENTS.has(intent)
}

/** tasks.type for a Director intent. simple_answer never reaches the Director. */
export function taskTypeForIntent(intent: DirectorIntent): string {
  switch (intent) {
    case 'marketing_research':
      return 'marketing_research'
    case 'content_creation':
      return 'content_creation'
    case 'campaign_planning':
      return 'campaign_planning'
    case 'performance_diagnosis':
      return 'performance_diagnosis'
    default:
      return 'simple_answer'
  }
}

/** Short human label for the visible handoff event. */
export function handoffLabel(intent: DirectorIntent): string {
  switch (intent) {
    case 'marketing_research':
      return 'Hand off to Director for research'
    case 'content_creation':
      return 'Hand off to Director to create content'
    case 'campaign_planning':
      return 'Hand off to Director to plan a campaign'
    case 'performance_diagnosis':
      return 'Hand off to Director for performance analysis'
    default:
      return 'Hand off to Director'
  }
}

export interface DirectorHandoff {
  intent: DirectorIntent
  type: string
  quantity: number
  researchMode: ResearchMode
  /** Route decision pre-seeded into the task checkpoint. */
  route: RouteDecision
  label: string
  /** Whether the Director should run the marketing research pipeline. */
  research: boolean
}

/** Build the handoff for a task-path decision, or null if it is not a real task. */
export function planDirectorHandoff(decision: OrchestratorDecision): DirectorHandoff | null {
  if (!isExecutionIntent(decision.intent)) return null
  const intent = decision.intent
  const quantity = Math.max(1, Math.min(Math.floor(decision.quantity) || 1, 12))
  const researchMode: ResearchMode = decision.researchMode ?? 'standard'
  const route: RouteDecision = {
    mode: 'task',
    reply: '',
    intent,
    quantity,
    ...(intent === 'marketing_research' ? { researchMode } : {}),
  }
  return {
    intent,
    type: taskTypeForIntent(intent),
    quantity,
    researchMode,
    route,
    label: handoffLabel(intent),
    research: intent === 'marketing_research',
  }
}

/** The task checkpoint to persist right after admit, before execution. */
export function handoffCheckpoint(handoff: DirectorHandoff): TaskCheckpoint {
  return {
    phase: 'generate',
    route: handoff.route,
  }
}