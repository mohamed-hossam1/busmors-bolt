/**
 * Busmora Employee — Shared Task Budget (single source of truth)
 *
 * Implements spec §3.8 / plan §2.3: one task-wide pool shared across the Director
 * and all participating agents (Orchestrator handoff usage where attributable,
 * every model/tool attempt, retry and review). These are UPPER BOUNDS, not goals.
 *
 * This module is pure data + pure functions. Runtime enforcement (atomic
 * reservation/settlement across concurrent workers) lives in the shared agent
 * runtime; this file defines the ceilings and a deterministic, unit-testable
 * reservation ledger used by that runtime and by the gateway preflight.
 *
 * Distinguish:
 *  - per-request context envelopes (src/config/ai-models.ts + context manager)
 *  - per-provider/account quotas (gateway accounting)
 *  - this shared per-task budget (this file)
 */

/** A resource ceiling with a soft (review) and hard (cannot exceed) limit. */
export interface BudgetCeiling {
  soft: number
  hard: number
}

/** Resource kinds tracked in one task budget. */
export type BudgetResource =
  | 'activeTimeMs'
  | 'llmAttempts'
  | 'inputTokens'
  | 'outputTokens'
  | 'externalToolAttempts'
  | 'concurrentSubtasks'

/** External tool per-task ceilings (within the aggregate hard limit). */
export type ExternalToolName = 'tavily' | 'exa' | 'firecrawl' | 'composio'

export interface AgentBudgets {
  activeTimeMs: BudgetCeiling
  llmAttempts: BudgetCeiling
  inputTokens: BudgetCeiling
  outputTokens: BudgetCeiling
  externalToolAttempts: BudgetCeiling
  concurrentSubtasks: BudgetCeiling
  /** Retries per failed operation (soft = 1, hard = 2). */
  retriesPerOperation: BudgetCeiling
  /** Per-tool ceilings within the aggregate externalToolAttempts hard limit. */
  externalToolCeilings: Record<ExternalToolName, number>
}

/**
 * Approved shared ceilings (spec §3.8). Max 3 concurrent specialist subtasks is
 * both soft and hard. Retries per failed operation: soft 1, hard 2.
 */
export const AGENT_BUDGETS: AgentBudgets = {
  activeTimeMs: { soft: 5 * 60 * 1000, hard: 10 * 60 * 1000 },
  llmAttempts: { soft: 25, hard: 50 },
  inputTokens: { soft: 150_000, hard: 300_000 },
  outputTokens: { soft: 25_000, hard: 50_000 },
  externalToolAttempts: { soft: 50, hard: 100 },
  concurrentSubtasks: { soft: 3, hard: 3 },
  retriesPerOperation: { soft: 1, hard: 2 },
  externalToolCeilings: {
    tavily: 25,
    exa: 25,
    firecrawl: 40,
    composio: 20,
  },
} as const

/** Current consumption of one task budget (all agents combined). */
export interface BudgetUsage {
  activeTimeMs: number
  llmAttempts: number
  inputTokens: number
  outputTokens: number
  externalToolAttempts: number
  concurrentSubtasks: number
  externalTool: Record<ExternalToolName, number>
}

export function emptyUsage(): BudgetUsage {
  return {
    activeTimeMs: 0,
    llmAttempts: 0,
    inputTokens: 0,
    outputTokens: 0,
    externalToolAttempts: 0,
    concurrentSubtasks: 0,
    externalTool: { tavily: 0, exa: 0, firecrawl: 0, composio: 0 },
  }
}

/** The budget dimension a request would exceed, or null if it fits. */
export interface BudgetDecision {
  allowed: boolean
  /** 'soft' when the request fits but crosses a soft ceiling (review advised). */
  level: 'ok' | 'soft' | 'hard'
  /** Which resource tripped the decision. */
  resource: BudgetResource | ExternalToolName | null
  reason: string
}

function check(resource: BudgetResource, ceiling: BudgetCeiling, next: number): BudgetDecision | null {
  if (next > ceiling.hard) {
    return { allowed: false, level: 'hard', resource, reason: `${resource} hard limit exceeded (${next} > ${ceiling.hard})` }
  }
  if (next > ceiling.soft) {
    return { allowed: true, level: 'soft', resource, reason: `${resource} soft limit crossed (${next} > ${ceiling.soft}); review remaining work` }
  }
  return null
}

/**
 * Decide whether the next unit of work fits the shared budget. Pure and
 * deterministic. The runtime calls this before each dispatch/reservation and
 * again atomically before commit. `next` is the projected total after the work.
 */
export function evaluateBudget(
  usage: BudgetUsage,
  next: Partial<Record<BudgetResource, number>> & { externalTool?: Partial<Record<ExternalToolName, number>> },
  budgets: AgentBudgets = AGENT_BUDGETS,
): BudgetDecision {
  const projected: BudgetUsage = {
    ...usage,
    ...('activeTimeMs' in next ? { activeTimeMs: next.activeTimeMs! } : {}),
    ...('llmAttempts' in next ? { llmAttempts: next.llmAttempts! } : {}),
    ...('inputTokens' in next ? { inputTokens: next.inputTokens! } : {}),
    ...('outputTokens' in next ? { outputTokens: next.outputTokens! } : {}),
    ...('externalToolAttempts' in next ? { externalToolAttempts: next.externalToolAttempts! } : {}),
    ...('concurrentSubtasks' in next ? { concurrentSubtasks: next.concurrentSubtasks! } : {}),
    externalTool: { ...usage.externalTool, ...(next.externalTool ?? {}) },
  }

  const checks: [BudgetResource, BudgetCeiling, number][] = [
    ['activeTimeMs', budgets.activeTimeMs, projected.activeTimeMs],
    ['llmAttempts', budgets.llmAttempts, projected.llmAttempts],
    ['inputTokens', budgets.inputTokens, projected.inputTokens],
    ['outputTokens', budgets.outputTokens, projected.outputTokens],
    ['externalToolAttempts', budgets.externalToolAttempts, projected.externalToolAttempts],
    ['concurrentSubtasks', budgets.concurrentSubtasks, projected.concurrentSubtasks],
  ]
  let softest: BudgetDecision | null = null
  for (const [resource, ceiling, value] of checks) {
    const decision = check(resource, ceiling, value)
    if (decision && !decision.allowed) return decision
    if (decision && decision.level === 'soft' && !softest) softest = decision
  }

  for (const tool of Object.keys(budgets.externalToolCeilings) as ExternalToolName[]) {
    const ceiling = budgets.externalToolCeilings[tool]
    const value = projected.externalTool[tool]
    if (value > ceiling) {
      return { allowed: false, level: 'hard', resource: tool, reason: `${tool} per-task ceiling exceeded (${value} > ${ceiling})` }
    }
  }

  return softest ?? { allowed: true, level: 'ok', resource: null, reason: 'within budget' }
}

/**
 * Reserve a finalization/review slice so research/creative work cannot consume
 * the whole task and leave nothing for synthesis, review and persistence.
 * Returns the usage with a reserved amount already reflected as consumed for the
 * purpose of further work admission (the runtime settles the true cost later).
 */
export function withFinalizationReserve(usage: BudgetUsage, reserve: Partial<BudgetUsage>): BudgetUsage {
  const out: BudgetUsage = {
    ...usage,
    externalTool: { ...usage.externalTool },
  }
  if (reserve.activeTimeMs) out.activeTimeMs += reserve.activeTimeMs
  if (reserve.llmAttempts) out.llmAttempts += reserve.llmAttempts
  if (reserve.inputTokens) out.inputTokens += reserve.inputTokens
  if (reserve.outputTokens) out.outputTokens += reserve.outputTokens
  if (reserve.externalToolAttempts) out.externalToolAttempts += reserve.externalToolAttempts
  if (reserve.externalTool) {
    for (const tool of Object.keys(reserve.externalTool) as ExternalToolName[]) {
      out.externalTool[tool] += reserve.externalTool[tool] ?? 0
    }
  }
  return out
}