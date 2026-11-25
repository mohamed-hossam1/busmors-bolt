/**
 * Deterministic roadmap execution helpers (Phase 4).
 *
 * Everything here is a pure function over already-persisted `roadmap_steps`
 * rows. Nothing is AI-invented: progress, the next best action and review
 * timing are all derived strictly from stored state so the UI is reproducible
 * and unit-testable with zero live API calls.
 *
 * The single source of truth for a step's UI state is `execution_state` (added
 * in the Phase 4 migration). For resilience against legacy rows we fall back to
 * mapping the older `status` (+ `attestation`) column when `execution_state` is
 * absent.
 */

import type { GeneratedActionKind, GeneratedPriority, GeneratedResponsibleParty } from './types'

export type ExecutionState =
  | 'not_started'
  | 'in_progress'
  | 'waiting_for_owner'
  | 'waiting_for_director'
  | 'blocked'
  | 'completed'
  | 'skipped'

export const EXECUTION_STATES: readonly ExecutionState[] = [
  'not_started',
  'in_progress',
  'waiting_for_owner',
  'waiting_for_director',
  'blocked',
  'completed',
  'skipped',
]

/** Minimal structural shape of a persisted roadmap step these helpers need. */
export interface ProgressStep {
  id: string
  step_key: string
  position: number
  milestone_key?: string | null
  milestone_position?: number | null
  priority?: GeneratedPriority | string | null
  owner_role?: GeneratedResponsibleParty | string | null
  action_kind?: GeneratedActionKind | string | null
  status?: string | null
  execution_state?: string | null
  attestation?: unknown
  dependencies?: string[] | null
}

export interface ProgressSummary {
  completedCount: number
  activeTotal: number
  percent: number
}

export interface NextBestAction<T extends ProgressStep = ProgressStep> {
  step: T
  reason: string
}

export interface ReviewDue {
  due: boolean
  daysOverdue: number
  daysRemaining: number
}

const DAY_MS = 24 * 60 * 60 * 1000

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 }

function isExecutionState(value: unknown): value is ExecutionState {
  return typeof value === 'string' && (EXECUTION_STATES as readonly string[]).includes(value)
}

/**
 * Map a persisted step to its Section 4.2 UI state.
 *
 * Prefers the explicit `execution_state` column; falls back to the legacy
 * `status` (+ owner role) mapping so older rows still render correctly.
 */
export function resolveExecutionState(step: ProgressStep): ExecutionState {
  if (isExecutionState(step.execution_state)) return step.execution_state

  const status = step.status ?? 'ready'
  switch (status) {
    case 'completed':
      return 'completed'
    case 'skipped':
    case 'inapplicable':
      return 'skipped'
    case 'blocked':
      return 'blocked'
    case 'owner_reported':
      // Director produced partial output: the owner must review/attest.
      return 'waiting_for_owner'
    case 'running':
      // A running Director step is awaiting Director output; a running owner
      // step is simply in progress.
      return step.owner_role === 'director' ? 'waiting_for_director' : 'in_progress'
    case 'ready':
    default:
      return 'not_started'
  }
}

/** True when the step is excluded from the active-progress denominator. */
export function isExcludedFromProgress(state: ExecutionState): boolean {
  return state === 'skipped'
}

/**
 * Deterministic progress from persisted rows only.
 *
 * `activeTotal` excludes skipped/inapplicable steps; `percent` is completed over
 * active, clamped to 0..100. When nothing is active the roadmap is treated as
 * fully complete (100%).
 */
export function computeProgress(steps: readonly ProgressStep[]): ProgressSummary {
  let completedCount = 0
  let activeTotal = 0
  for (const step of steps) {
    const state = resolveExecutionState(step)
    if (state === 'completed') completedCount += 1
    if (!isExcludedFromProgress(state)) activeTotal += 1
  }
  const percent = activeTotal === 0 ? 100 : Math.min(100, Math.max(0, Math.round((completedCount / activeTotal) * 100)))
  return { completedCount, activeTotal, percent }
}

/** Actionable states: the owner can move these forward right now. */
function isActionable(state: ExecutionState): boolean {
  return (
    state === 'not_started' ||
    state === 'in_progress' ||
    state === 'waiting_for_owner' ||
    state === 'waiting_for_director'
  )
}

function priorityRank(priority: ProgressStep['priority']): number {
  const key = typeof priority === 'string' ? priority : 'medium'
  return PRIORITY_RANK[key] ?? PRIORITY_RANK.medium
}

function milestoneRank(step: ProgressStep): number {
  return typeof step.milestone_position === 'number' ? step.milestone_position : Number.MAX_SAFE_INTEGER
}

/**
 * Deterministically pick the single highest-priority actionable step whose
 * dependencies are satisfied (completed/skipped), preferring high priority then
 * the earliest milestone/position. Returns a human-readable reason.
 */
export function selectNextBestAction<T extends ProgressStep>(steps: readonly T[]): NextBestAction<T> | null {
  const stateByKey = new Map<string, ExecutionState>()
  for (const step of steps) stateByKey.set(step.step_key, resolveExecutionState(step))

  const satisfied = (step: ProgressStep): boolean => {
    const deps = Array.isArray(step.dependencies) ? step.dependencies : []
    return deps.every((dep) => {
      const depState = stateByKey.get(dep)
      // Unknown dependencies (not part of this plan) are treated as satisfied so
      // a dangling reference can never deadlock the whole roadmap.
      if (depState === undefined) return true
      return depState === 'completed' || depState === 'skipped'
    })
  }

  const candidates = steps
    .filter((step) => isActionable(resolveExecutionState(step)) && satisfied(step))
    .sort((a, b) => {
      const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority)
      if (priorityDiff !== 0) return priorityDiff
      const milestoneDiff = milestoneRank(a) - milestoneRank(b)
      if (milestoneDiff !== 0) return milestoneDiff
      return a.position - b.position
    })

  const next = candidates[0]
  if (!next) return null

  const state = resolveExecutionState(next)
  const priority = typeof next.priority === 'string' ? next.priority : 'medium'
  const reason =
    state === 'waiting_for_owner'
      ? `${priority} priority · ready for your review · dependencies satisfied`
      : state === 'waiting_for_director'
        ? `${priority} priority · awaiting the Marketing Director · dependencies satisfied`
        : state === 'in_progress'
          ? `${priority} priority · already started · dependencies satisfied`
          : `${priority} priority · first actionable step · dependencies satisfied`

  return { step: next, reason }
}

/**
 * Pure due-review check. No polling or background timers: the caller passes the
 * current time. Returns whether a review is due plus days overdue/remaining.
 */
export function isReviewDue(
  nextReviewAt: string | null | undefined,
  now: Date | number = Date.now(),
): ReviewDue {
  if (!nextReviewAt) return { due: false, daysOverdue: 0, daysRemaining: 0 }
  const target = new Date(nextReviewAt).getTime()
  if (Number.isNaN(target)) return { due: false, daysOverdue: 0, daysRemaining: 0 }
  const nowMs = typeof now === 'number' ? now : now.getTime()
  const diff = nowMs - target
  if (diff >= 0) {
    return { due: true, daysOverdue: Math.floor(diff / DAY_MS), daysRemaining: 0 }
  }
  return { due: false, daysOverdue: 0, daysRemaining: Math.ceil(-diff / DAY_MS) }
}

export function isDirectorActionKind(actionKind: ProgressStep['action_kind']): boolean {
  return actionKind === 'research' || actionKind === 'analysis' || actionKind === 'content'
}

export function isContentActionKind(actionKind: ProgressStep['action_kind']): boolean {
  return actionKind === 'content'
}

/**
 * Completion rule: a step (and its milestone) is only `completed` after an
 * explicit owner action. Director output alone (a Deliverable or Calendar draft)
 * moves the step to `waiting_for_owner`, never `completed`.
 */
export function completionRequiresOwnerAction(): boolean {
  return true
}