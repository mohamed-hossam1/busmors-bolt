import type { TaskOrigin, TaskStatus } from '../../lib/contracts'

/**
 * Minimal task record for the generic lifecycle and historical reads.
 *
 * The retired intelligence checkpoints/results are intentionally not modelled
 * here. Historical rows may contain extra columns; structural typing at the
 * database boundary keeps those readable without reviving retired contracts.
 */
export interface ExecutionTask {
  id: string
  workspace_id: string
  conversation_id: string
  type: string
  status: TaskStatus
  version: number
  origin: TaskOrigin
  user_request: string
  run_id: string | null
  runner_id: string | null
  result_summary: string | null
  attempts: number
  trace_id?: string | null
  allowance?: { calls: number; pages: number; tokens: number; seconds: number }
  consumption?: { calls?: number; tokensAccounted?: number }
  created_at: string
  updated_at: string
}