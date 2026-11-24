/**
 * Busmora Employee — Shared Agent Runtime contracts (Phase 1A).
 *
 * Pure data + pure functions describing the five approved LLM roles, the model
 * routing table, the task/subtask/agent-instance identity model, parent
 * relationships, the bounded model-action-result loop, and the result/status
 * contracts. No I/O. The runtime (dispatcher, executor, gateway) implements the
 * behaviour; this file is the typed vocabulary every phase shares.
 *
 * Spec: MVP §2 (Orchestrator), §3 (Director), §4 (Research), §5 (Content),
 * §6 (Analyst), §7 (lifecycle), §10 (Canvas). Plan §2.1 (inventory).
 */

import type { ModelConfig } from '../../config/ai-models'

/** The five approved roles. No others exist in the MVP. */
export type AgentRole = 'orchestrator' | 'director' | 'research' | 'content' | 'marketing_analyst'

/** Roles that may delegate to specialists. Only the Director delegates. */
export const DELEGATING_ROLES: readonly AgentRole[] = ['director']

/** Specialists that report to the Director (never to the user or each other). */
export type SpecialistRole = 'research' | 'content' | 'marketing_analyst'
export const SPECIALIST_ROLES: readonly SpecialistRole[] = ['research', 'content', 'marketing_analyst']

/** Per-role temperature (spec §2.1 inventory). */
export const ROLE_TEMPERATURE: Record<AgentRole, number> = {
  orchestrator: 0.2,
  director: 0.3,
  research: 0.3,
  content: 0.7,
  marketing_analyst: 0.3,
} as const

/** The task lifecycle status shared by tasks and subtasks (spec §7). */
export type TaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export const TERMINAL_STATUSES: readonly TaskStatus[] = ['completed', 'partial', 'failed', 'cancelled']

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

/** A stable agent-instance id for one invocation of a role (including repeats). */
export interface AgentInstanceRef {
  /** Globally unique instance id; distinct per physical invocation. */
  instanceId: string
  role: AgentRole
  /** Parent instance id for hierarchy (null for the Orchestrator root). */
  parentInstanceId: string | null
  /** The task this instance belongs to. */
  taskId: string
  /** For specialists, the delegated subtask id. */
  subtaskId?: string | null
  /** 1-based attempt index within this instance's task. */
  attempt: number
}

/** A delegated specialist subtask with stable id and parent association. */
export interface Subtask {
  id: string
  taskId: string
  parentInstanceId: string
  specialist: SpecialistRole
  goal: string
  scope: string
  contextRefs: string[]
  constraints: string[]
  requestedLanguage: string
  outputCriteria: string[]
  /** Resource allocation hint (bounded; runtime enforces ceilings). */
  budgetAllocation?: Record<string, number>
  dependsOn: string[]
  status: TaskStatus
  createdAt: string
}

/** The bounded model-action-result loop action vocabulary (spec §3.6). */
export type AgentAction =
  | { type: 'answer'; text: string }
  | { type: 'read_skill'; skillId: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'ask_clarification'; questions: ClarificationQuestion[] }
  | { type: 'delegate'; specialist: SpecialistRole; goal: string; scope: string }
  | { type: 'request_revision'; targetInstanceId: string; defect: string; desired: string }
  | { type: 'stop_agent_work'; targetInstanceId: string; reason: string }
  | { type: 'finish'; status: TaskStatus; summary: string }

/** One clarification question in a Clarification Card (spec §7). */
export interface ClarificationQuestion {
  id: string
  prompt: string
  kind: 'single' | 'multiple' | 'text'
  options?: string[]
  allowCustom?: boolean
  allowNotSure?: boolean
}

/** The actual outcome fed back to the model after a validated action. */
export type ActionResult =
  | { type: 'answer'; ok: true }
  | { type: 'read_skill'; ok: boolean; skillId: string; version?: string; content?: string; error?: string }
  | { type: 'tool_call'; ok: boolean; tool: string; result?: unknown; error?: string }
  | { type: 'ask_clarification'; ok: true; inputId: string }
  | { type: 'delegate'; ok: boolean; subtaskId?: string; error?: string }
  | { type: 'request_revision'; ok: boolean; error?: string }
  | { type: 'stop_agent_work'; ok: boolean; error?: string }
  | { type: 'finish'; ok: true }
  | { type: 'rejected'; reason: string }

/** One step of the bounded model-action-result loop. */
export interface AgentStep {
  index: number
  action: AgentAction
  result: ActionResult
  startedAt: string
  endedAt: string
}

/** The structured result a specialist returns to the Director (spec §4.6/5.6/6.6). */
export interface AgentResult {
  instanceId: string
  role: AgentRole
  status: TaskStatus
  /** Human/model-readable summary of what was produced. */
  summary: string
  /** Structured output items (shape varies by role; intentionally open). */
  items: unknown[]
  /** Evidence / source references actually used (ids, not fabricated). */
  evidenceRefs: string[]
  /** Limitations, gaps, unresolved conflicts — honest, never fabricated. */
  limitations: string[]
  /** Optional Brain knowledge candidates (never auto-applied). */
  brainCandidates: BrainCandidate[]
  /** Actual resource consumption reported by the runtime (not model-invented). */
  usage: {
    llmAttempts: number
    inputTokens: number
    outputTokens: number
    externalToolAttempts: number
    durationMs: number
  }
  stopReason: string
}

/** A proposed durable Brain change, always pending owner approval (spec §8). */
export interface BrainCandidate {
  change: 'add' | 'edit' | 'delete'
  category: string
  title: string
  proposedValue: string
  previousValue?: string
  source: string
  rationale: string
  status: 'unapproved' | 'conflict' | 'duplicate'
}

/** Model routing for one role, resolved centrally by the gateway. */
export interface RoleModelRoute {
  role: AgentRole
  primary: ModelConfig
  fallbacks: readonly { provider: ModelConfig['provider']; model: string }[]
  /** Per-request application input cap (tokens, entire serialized request). */
  inputCap: number
  /** Per-request application completion cap (tokens, incl. reasoning where counted). */
  completionCap: number
}

/** Hierarchy helpers for Canvas / trace projection (spec §10). */
export function isSpecialist(role: AgentRole): role is SpecialistRole {
  return (SPECIALIST_ROLES as readonly AgentRole[]).includes(role)
}

/** A role may delegate only if it is the Director (centralized delegation). */
export function canDelegate(role: AgentRole): boolean {
  return role === 'director'
}

/** Only the Director may own the final delivery; specialists return results. */
export function ownsDelivery(role: AgentRole): boolean {
  return role === 'director'
}