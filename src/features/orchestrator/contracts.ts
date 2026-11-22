// Orchestrator-first message flow contracts.
//
// Every incoming user message reaches the Orchestrator first. The Orchestrator
// understands intent and chooses exactly one execution path:
//   A) direct   — answer immediately, no Brain, no Director, no Task.
//   B) brain    — retrieve approved company knowledge, then answer from it.
//   C) task     — hand the request to the Director (execution delegate).
//
// These types are pure data so the gateway can be unit-tested with fakes and
// reused from the server wiring without leaking provider or database detail.

export type OrchestratorPath = 'direct' | 'brain' | 'task'

/** The final outcome of one orchestration, including non-execution outcomes. */
export type OrchestratorOutcome = OrchestratorPath | 'refuse' | 'error'

/** Execution intents the Director already understands. */
export type DirectorIntent =
  | 'simple_answer'
  | 'marketing_research'
  | 'content_creation'
  | 'campaign_planning'
  | 'performance_diagnosis'

export const DIRECTOR_INTENTS: readonly DirectorIntent[] = [
  'simple_answer',
  'marketing_research',
  'content_creation',
  'campaign_planning',
  'performance_diagnosis',
]

export type ResearchMode = 'quick' | 'standard' | 'deep'

/** One approved Brain fact returned by the read-only retrieval tool. */
export interface BrainFact {
  id: string
  category: string
  title: string
  summary: string
  verificationState: string | null
  score: number
}

/** Result of one Brain retrieval tool call. Read-only and tenant-scoped. */
export interface BrainRetrieval {
  ok: boolean
  query: string
  facts: BrainFact[]
  retrievedCount: number
  reason?: string
  elapsedMs: number
}

/** Normalized decision the Orchestrator model produced for one message. */
export interface OrchestratorDecision {
  path: OrchestratorPath
  /** Answer text for the direct path. */
  reply: string
  /** Retrieval query for the brain path. */
  brainQuery: string
  /** Detected execution intent for the task path. */
  intent: DirectorIntent
  /** Requested quantity for content/campaign tasks (>=1). */
  quantity: number
  /** Research depth when intent is marketing_research. */
  researchMode: ResearchMode
}

/** Deterministic, server-enforced pre-model decision. */
export interface GuardrailResult {
  action: 'allow' | 'refuse' | 'out_of_scope'
  reason: string
  /** Safe text shown to the user for refuse / out_of_scope. */
  message: string
  /** Non-security hint used only to bias the model prompt. */
  hint: 'likely_direct' | 'likely_brain' | 'likely_task' | null
  /** True when a prompt-injection / system-prompt probe was detected. */
  injection: boolean
}

/** Timing and volume counters for one orchestration (persisted for benchmarks). */
export interface OrchestratorMetrics {
  decisionMs: number
  brainMs: number
  directorHandoffMs: number
  totalMs: number
  modelCalls: number
  brainCalls: number
}

/** A persisted canvas event for the conversation-scoped orchestration stream. */
export interface OrchestratorEventInput {
  type: 'agent_started' | 'agent_completed' | 'agent_error' | 'tool_call' | 'delegation' | 'flow_connection'
  /** Node this event belongs to; all events sharing an id merge into one node. */
  instanceId: string
  agentId: string
  agentRole: 'orchestrator' | 'director' | 'subagent' | 'tool' | 'skill' | 'auditor' | 'synthesis'
  label: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed'
  publicMessage: string
  parameters?: Record<string, unknown>
  parentInstanceId?: string | null
  startedAt?: string | null
  endedAt?: string | null
  failureReason?: string | null
}

/** Result returned to the frontend after one orchestration. */
export interface OrchestratorResult {
  outcome: OrchestratorOutcome
  path: OrchestratorPath | null
  taskId: string | null
  messageId: string | null
  reply: string
  metrics: OrchestratorMetrics
}

export const EMPTY_METRICS: OrchestratorMetrics = {
  decisionMs: 0,
  brainMs: 0,
  directorHandoffMs: 0,
  totalMs: 0,
  modelCalls: 0,
  brainCalls: 0,
}

export function isDirectorIntent(value: unknown): value is DirectorIntent {
  return typeof value === 'string' && (DIRECTOR_INTENTS as readonly string[]).includes(value)
}

export function isResearchMode(value: unknown): value is ResearchMode {
  return value === 'quick' || value === 'standard' || value === 'deep'
}