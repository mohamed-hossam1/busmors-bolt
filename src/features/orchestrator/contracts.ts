// Orchestrator-first message flow contracts.
//
// Every incoming user message reaches the Orchestrator first. The Orchestrator
// understands intent and chooses exactly one path:
//   A) direct — answer immediately, no Brain, no Director, no Task.
//   B) brain  — retrieve approved company knowledge, then answer from it.
//   C) task   — classified as a task request. The current clean baseline does
//               not execute tasks; the gateway answers with an honest temporary
//               unavailability response and never enqueues work.
//
// These types are pure data so the gateway can be unit-tested with fakes.

export type OrchestratorPath = 'direct' | 'brain' | 'task'

/** The final outcome of one orchestration, including non-execution outcomes. */
export type OrchestratorOutcome = OrchestratorPath | 'refuse' | 'error'

/** Classification values the Orchestrator prompt may return. */
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
  /** Detected request classification for the task path. */
  intent: DirectorIntent
  /** Requested quantity for content/campaign requests (>=1). */
  quantity: number
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
  totalMs: number
  modelCalls: number
  brainCalls: number
}

/** A persisted conversation event for the orchestration stream. */
export interface OrchestratorEventInput {
  type: 'agent_started' | 'agent_completed' | 'agent_error' | 'tool_call' | 'delegation' | 'flow_connection'
  /** Node this event belongs to; all events sharing an id merge into one node. */
  instanceId: string
  agentId: string
  agentRole: 'orchestrator' | 'subagent' | 'tool' | 'skill'
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
  totalMs: 0,
  modelCalls: 0,
  brainCalls: 0,
}

export function isDirectorIntent(value: unknown): value is DirectorIntent {
  return typeof value === 'string' && (DIRECTOR_INTENTS as readonly string[]).includes(value)
}

/**
 * Orchestrator V2 logical internal capabilities (spec §2.4).
 *
 * Names are proposed contracts, not evidence of existing implementations. The
 * central tool registry + server-side allowlist apply. The Orchestrator must not
 * require a tool call for data already present in trusted runtime context, and no
 * capability is exposed to the model unless it is implemented and enabled.
 */
export type OrchestratorCapability =
  | 'read_business_brain'
  | 'propose_brain_change'
  | 'delegate_to_director'
  | 'get_task_status'
  | 'get_product_knowledge'

export interface OrchestratorCapabilitySpec {
  name: OrchestratorCapability
  responsibility: string
  boundary: string
}

export const ORCHESTRATOR_CAPABILITIES: readonly OrchestratorCapabilitySpec[] = [
  {
    name: 'read_business_brain',
    responsibility: 'Read approved current business facts, optionally by relevant reference/query.',
    boundary: 'Read-only, authorized workspace.',
  },
  {
    name: 'propose_brain_change',
    responsibility: 'Create an add/edit/delete proposal with source, rationale and old/new values as applicable.',
    boundary: 'Creates a pending approval only; cannot approve or apply it.',
  },
  {
    name: 'delegate_to_director',
    responsibility: 'Submit an authorized marketing task with structured context or a continuation reference.',
    boundary: 'Validated handoff, deduplicated by request; no specialist selection or execution planning.',
  },
  {
    name: 'get_task_status',
    responsibility: 'Retrieve factual execution status and available result references.',
    boundary: 'Read-only, authorized task/workspace; no invented progress.',
  },
  {
    name: 'get_product_knowledge',
    responsibility: 'Retrieve the maintained Busmora feature/workflow reference if not already provided.',
    boundary: 'Read-only; current capabilities, not speculation.',
  },
] as const

/**
 * Director handoff payload (spec §2.4). The runtime derives workspace identity and
 * authorization from the authenticated session, never from model-provided ids.
 */
export interface DirectorHandoff {
  /** Original user request, or a secure lossless reference to it. */
  originalRequest: string
  intendedOutcome: string
  relevantConversation: { role: string; content: string }[]
  approvedBrainContext: BrainFact[]
  /** Clearly labelled unapproved facts used as temporary context. */
  unapprovedFacts: string[]
  constraints: string[]
  /** Task/deliverable references for revisions. */
  revisionRefs: string[]
  /** Requested output language. */
  outputLanguage: string
}

/** Status contract returned by get_task_status — factual, never invented. */
export interface TaskStatusSnapshot {
  taskId: string | null
  status: OrchestratorOutcome | 'running' | 'queued' | 'awaiting_input'
  /** Available result references, if any (ids only). */
  resultRefs: string[]
  /** True when this reflects an actual confirmed runtime state. */
  confirmed: boolean
}