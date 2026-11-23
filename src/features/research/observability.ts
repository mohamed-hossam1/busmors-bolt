/**
 * Minimal structural sink the research pipeline writes tool executions to.
 *
 * It is deliberately free of server-only imports so shared research modules can
 * reference it; the server TraceCollector satisfies it structurally.
 */
export interface ResearchToolRecord {
  toolName: string
  agentId?: string
  agentRole?: string
  provider?: string | null
  operation?: string | null
  callId?: string | null
  status?: string | null
  startedAt?: string
  endedAt?: string
  durationMs?: number
  input?: unknown
  output?: unknown
  outputOriginalBytes?: number
  error?: string | null
  parentEventId?: string | null
  runId?: string | null
  attempt?: number
}

export interface ResearchTraceSink {
  recordTool(record: ResearchToolRecord): void
}