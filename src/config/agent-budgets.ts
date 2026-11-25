export interface AgentBudgets {
  activeExecutionTimeoutMs: number
  maxLlmCallsPerTask: number
  maxExternalToolCallsPerTask: number
  maxConcurrentSpecialistSubtasks: number
  maxRetriesPerFailedOperation: number
}

export const AGENT_BUDGETS = {
  activeExecutionTimeoutMs: 10 * 60 * 1000,
  maxLlmCallsPerTask: 50,
  maxExternalToolCallsPerTask: 100,
  maxConcurrentSpecialistSubtasks: 3,
  maxRetriesPerFailedOperation: 2,
} as const satisfies AgentBudgets

export const AGENT_BUDGET_LIMITS = AGENT_BUDGETS