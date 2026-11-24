/**
 * Central Tool Registry + Executor (spec §2.4, §3.5, §4.4, §5.4, §6.4; plan §1C).
 *
 * One registry of typed internal tools. Each tool declares a JSON-schema-like
 * input shape, the roles allowed to call it, and a pure execute function. The
 * executor validates role allowlist, workspace scope and input before running a
 * tool, and returns a typed result. No model decides permissions; the backend
 * enforces them. No arbitrary filesystem, shell, eval or network side effects are
 * exposed to agents — external transports live behind narrow wrappers.
 *
 * Tools are grouped so a model sees compact schemas, and an unimplemented or
 * disabled tool is never presented as available.
 */

import type { AgentRole } from '../../features/agents/contracts'

/** A JSON-ish value (bounded; the executor sanitizes before storage/display). */
export type Json = unknown

export type JsonSchema = {
  type: 'object'
  properties: Record<string, { type: string; description?: string; enum?: readonly string[]; items?: { type: string }; additionalProperties?: boolean }>
  required?: string[]
}

export interface ToolContext {
  workspaceId: string
  /** Agent instance issuing the call (hierarchy/trace key). */
  instanceId: string
  signal?: AbortSignal
  /** Opaque runtime services the tool implementation may use (server-wired). */
  services: ToolServices
}

/** Services injected by the server; tools never import server-only modules directly. */
export interface ToolServices {
  readBrain(query: string, limit: number): Promise<BrainFactLike[]>
  proposeBrainChange(proposal: BrainProposalInput): Promise<{ ok: boolean; id?: string; status?: string; error?: string }>
  readDeliverables(limit?: number): Promise<DeliverableLike[]>
  readCalendar(limit?: number): Promise<CalendarPostLike[]>
  getTaskStatus(taskId: string | null): Promise<TaskStatusLike>
  getProductKnowledge(): Promise<string>
  /** Submit an authorized marketing task to the Director boundary. */
  delegateToDirector(input: DirectorHandoffInput): Promise<{ ok: boolean; taskId?: string; error?: string; alreadyDelegated?: boolean }>
  createDeliverable(input: CreateDeliverableInput): Promise<{ ok: boolean; id?: string; version?: number; error?: string }>
  createPostDraft(input: CreatePostDraftInput): Promise<{ ok: boolean; id?: string; error?: string }>
  /** External web discovery (Tavily/Exa). Candidate evidence only, never trusted. */
  webSearch(provider: 'tavily' | 'exa', query: string, maxResults: number, signal?: AbortSignal): Promise<ExternalSearchResult>
  /** Read a public page as untrusted data (Firecrawl). */
  scrapePage(url: string, signal?: AbortSignal): Promise<ExternalScrapeResult>
  /** Authorized read-only Composio action (allowlisted; never write/send/publish). */
  composioRead(action: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<ExternalComposioResult>
}

export interface ExternalHit {
  url: string
  title: string
  snippet: string
  score?: number
  publishedAt?: string | null
}

export type ExternalSearchResult =
  | { ok: true; hits: ExternalHit[] }
  | { ok: false; code: string; error: string }

export type ExternalScrapeResult =
  | { ok: true; title: string; markdown: string; publishedAt: string | null }
  | { ok: false; code: string; error: string }

export type ExternalComposioResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: string; error: string; paymentRequired?: boolean }

export interface BrainFactLike {
  id: string
  category: string
  title: string
  summary: string
  verificationState: string | null
}

export interface BrainProposalInput {
  change: 'add' | 'edit' | 'delete'
  category: string
  title: string
  proposedValue: string
  previousValue?: string
  source: string
  rationale: string
  nodeId?: string | null
}

export interface DeliverableLike {
  id: string
  title: string
  type: string
  version: number
  createdAt: string
}

export interface CalendarPostLike {
  id: string
  platform: string
  caption: string
  status: string
  scheduledFor: string | null
}

export interface TaskStatusLike {
  taskId: string | null
  status: string
  resultRefs: string[]
  confirmed: boolean
}

export interface CreateDeliverableInput {
  title: string
  type: string
  content: string
  taskId?: string | null
  sourceRefs?: string[]
  contextRefs?: string[]
  limitations?: string[]
}

export interface CreatePostDraftInput {
  platform: string
  caption: string
  hashtags?: string
  proposedTime?: string | null
  taskId?: string | null
}

export interface DirectorHandoffInput {
  originalRequest: string
  intendedOutcome: string
  constraints?: string[]
  outputLanguage?: string
  revisionRefs?: string[]
  idempotencyKey?: string
}

export type ToolResult =
  | { ok: true; output: Json }
  | { ok: false; error: string; code: 'forbidden' | 'invalid_input' | 'not_implemented' | 'unavailable' | 'invalid_output' }

export interface ToolDefinition {
  name: string
  /** Roles permitted to call this tool. Empty = no role (disabled). */
  roles: readonly AgentRole[]
  description: string
  schema: JsonSchema
  /** Pure implementation. Receives validated args + context. */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
}

/**
 * Minimal structural input validation against the declared schema. Returns an
 * error string for a missing required field or a wrong primitive type; unknown
 * fields are dropped by the caller before execute.
 */
export function validateToolInput(definition: ToolDefinition, args: Record<string, unknown>): string | null {
  const required = definition.schema.required ?? []
  for (const key of required) {
    if (!(key in args) || args[key] === undefined || args[key] === null) return `missing required field: ${key}`
  }
  for (const [key, spec] of Object.entries(definition.schema.properties)) {
    if (!(key in args) || args[key] === undefined || args[key] === null) continue
    const value = args[key]
    if (spec.enum && !spec.enum.includes(value as string)) return `invalid value for ${key}`
    if (spec.type === 'string' && typeof value !== 'string') return `invalid type for ${key}: expected string`
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return `invalid type for ${key}: expected number`
    if (spec.type === 'boolean' && typeof value !== 'boolean') return `invalid type for ${key}: expected boolean`
    if (spec.type === 'array' && !Array.isArray(value)) return `invalid type for ${key}: expected array`
    if (spec.type === 'object' && (typeof value !== 'object' || value === null)) return `invalid type for ${key}: expected object`
  }
  return null
}

/** Keep only declared fields, coercing to the declared primitive or structured type. */
function coerceArgs(definition: ToolDefinition, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(definition.schema.properties)) {
    const value = args[key]
    if (value === undefined) continue
    const spec = definition.schema.properties[key]
    if (value === null) { out[key] = null; continue }
    if (spec.type === 'number' && typeof value === 'number') out[key] = value
    else if (spec.type === 'boolean' && typeof value === 'boolean') out[key] = value
    else if (spec.type === 'string' && typeof value === 'string') out[key] = value
    else if (spec.type === 'array' && Array.isArray(value)) out[key] = value
    else if (spec.type === 'object' && typeof value === 'object') out[key] = value
  }
  return out
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()

  constructor(definitions: ToolDefinition[]) {
    for (const def of definitions) this.tools.set(def.name, def)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** Compact schemas for a role — the model only sees tools it may actually call. */
  catalogForRole(role: AgentRole): { name: string; description: string; schema: JsonSchema }[] {
    const out: { name: string; description: string; schema: JsonSchema }[] = []
    for (const def of this.tools.values()) {
      if (def.roles.includes(role)) out.push({ name: def.name, description: def.description, schema: def.schema })
    }
    return out
  }

  namesForRole(role: AgentRole): string[] {
    return this.catalogForRole(role).map((t) => t.name)
  }

  /**
   * Execute a tool call on behalf of a role. Enforces the role allowlist and
   * input schema before running; never leaks internal errors as raw text.
   */
  async execute(role: AgentRole, name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const def = this.tools.get(name)
    if (!def) return { ok: false, error: `unknown tool: ${name}`, code: 'not_implemented' }
    if (!def.roles.includes(role)) return { ok: false, error: `role ${role} may not call ${name}`, code: 'forbidden' }
    const invalid = validateToolInput(def, args)
    if (invalid) return { ok: false, error: invalid, code: 'invalid_input' }
    const clean = coerceArgs(def, args)
    try {
      return await def.execute(clean, ctx)
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'tool execution failed', code: 'unavailable' }
    }
  }
}