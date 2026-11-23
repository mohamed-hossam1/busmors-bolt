/** Shared admin observability types (safe for client components). */

export interface AdminTraceListItem {
  id: string
  workspace_id: string | null
  user_id: string | null
  conversation_id: string | null
  request: string
  route: string | null
  status: string
  started_at: string | null
  completed_at: string | null
  final_reply: string | null
  has_admin_trace: boolean
  has_task: boolean
  task_id: string | null
  llm_input_tokens: number
  llm_output_tokens: number
  llm_total_tokens: number
  model_call_count: number
  tool_call_count: number
  agent_count: number
}

export interface AdminTraceEventRow {
  id: string
  trace_id: string
  parent_event_id: string | null
  event_type: string
  seq: number
  agent_id: string | null
  agent_role: string | null
  parent_agent_id: string | null
  run_id: string | null
  attempt: number | null
  instance_id: string | null
  correlation_id: string | null
  tool_name: string | null
  operation: string | null
  provider: string | null
  model: string | null
  call_id: string | null
  status: string | null
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  input_payload: unknown
  output_preview: unknown
  output_truncated: boolean
  output_original_bytes: number | null
  llm_input_tokens: number
  llm_output_tokens: number
  llm_total_tokens: number
  cached_tokens: number
  reasoning_tokens: number
  retry_attempt: number | null
  fallback_used: boolean
  error: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface AdminTraceListFilters {
  page?: number
  pageSize?: number
  q?: string
  status?: string
  route?: string
  from?: string
  to?: string
  workspaceId?: string
  userId?: string
}

export interface AdminTraceListResult {
  data: AdminTraceListItem[]
  page: number
  pageSize: number
  total: number
}

export interface AdminTraceDetail {
  trace: AdminTraceListItem
  events: AdminTraceEventRow[]
  fallback: {
    agentEvents: Record<string, unknown>[]
    steps: Record<string, unknown>[]
    usage: Record<string, unknown>[]
  }
  reconstructed: boolean
}