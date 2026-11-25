import { tool, type ToolSet } from 'ai'
import type { ZodType } from 'zod'
import type { AgentRole } from '../../config/ai-models'
import type { TraceCollector } from '../observability'

/**
 * Shared tool registry with backend-enforced per-agent allowlists.
 *
 * A tool is defined once (name, description, zod input schema, a pure execute
 * function, and whether it counts as an external call). At dispatch time the
 * runtime builds the AI SDK ToolSet for a role from the allowlist only, and every
 * execution is wrapped to: validate workspace scoping, enforce the external-tool
 * budget, and emit a tool trace event (name, validated args, output/error,
 * latency). An agent therefore only ever receives and can execute its authorized
 * tools.
 */

export interface ToolTraceContext {
  traceId: string
  parentEventId?: string | null
}

export interface ToolBudgetTracker {
  canCallExternalTool(): boolean
  recordExternalToolCall(): void
  /** Optional: record that a tool was actually invoked (for usedTools). */
  recordToolUse?(toolName: string): void
}

export interface ToolExecutionContext extends ToolTraceContext {
  workspaceId: string
  tracker: ToolBudgetTracker
  instanceId?: string | null
  collector?: TraceCollector
  signal?: AbortSignal
}

export type ToolExecute<Args = unknown, Output = unknown> = (
  args: Args,
  ctx: ToolExecutionContext,
) => Promise<Output>

export interface ToolDefinition<Args = unknown, Output = unknown> {
  name: string
  description: string
  inputSchema: ZodType<Args>
  /** External tools count against maxExternalToolCallsPerTask. */
  external: boolean
  execute: ToolExecute<Args, Output>
}

export class ToolBudgetError extends Error {
  constructor(toolName: string) {
    super(`External tool "${toolName}" blocked: the task external-tool budget is exhausted.`)
    this.name = 'ToolBudgetError'
  }
}

export class ToolWorkspaceError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" rejected: workspace scope mismatch.`)
    this.name = 'ToolWorkspaceError'
  }
}

/**
 * Per-agent tool allowlist. An agent receives only the tools listed for its role
 * that are also present in the registry. Extend here as capabilities are added;
 * never grant a role a tool it is not explicitly allowed to use.
 */
export const ROLE_TOOL_ALLOWLIST: Record<AgentRole, readonly string[]> = {
  // Orchestrator: 0 skills, 0 external tools, exactly 3 internal tools (spec 2.4).
  orchestrator: ['read_business_brain', 'propose_brain_change', 'delegate_to_director'],
  // Director: internal delivery/read tools + 3 external web tools (spec 3.5).
  // No Composio, no publishing/scheduling, no filesystem/shell, no direct DB write.
  director: [
    'read_skill',
    'read_business_brain',
    'read_workspace_context',
    'read_deliverables',
    'read_calendar',
    'ask_clarification',
    'create_or_version_deliverable',
    'create_or_update_post_draft',
    'propose_brain_change',
    'tavily_search',
    'exa_search',
    'firecrawl_scrape',
    'delegate_agent',
  ],
  // Research Agent: strictly read-only evidence specialist (spec 4.4).
  // No Calendar, no Deliverable/Brain writes, no publishing/outreach, no
  // specialist-to-specialist calls, no filesystem/shell. Web tools are the only
  // external calls and reuse the shared web-providers adapters.
  research: [
    'read_skill',
    'read_business_brain',
    'read_deliverables',
    'get_task_context',
    'tavily_search',
    'exa_search',
    'firecrawl_scrape',
  ],
  content: [],
  'marketing-analyst': [],
}

export function isToolAllowedForRole(role: AgentRole, toolName: string): boolean {
  return ROLE_TOOL_ALLOWLIST[role]?.includes(toolName) ?? false
}

function hasOwnWorkspaceMismatch(args: unknown, workspaceId: string): boolean {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false
  const candidate = (args as Record<string, unknown>).workspaceId
  return typeof candidate === 'string' && candidate.length > 0 && candidate !== workspaceId
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Wrap a tool definition so every call is workspace-validated, budget-checked,
 * and traced. The returned AI SDK tool is what the model actually receives.
 */
export function wrapTool<Args, Output>(
  definition: ToolDefinition<Args, Output>,
  baseContext: Omit<ToolExecutionContext, 'signal'>,
) {
  return tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: async (rawArgs: Args, options: { abortSignal?: AbortSignal }) => {
      const startedAt = new Date().toISOString()
      const startMs = Date.now()
      const ctx: ToolExecutionContext = { ...baseContext, signal: options?.abortSignal }
      const record = (fields: {
        status: string
        output?: unknown
        error?: string | null
      }): void => {
        baseContext.collector?.recordTool({
          toolName: definition.name,
          operation: definition.external ? 'external' : 'internal',
          durationMs: Date.now() - startMs,
          startedAt,
          endedAt: new Date().toISOString(),
          input: rawArgs,
          output: fields.output,
          status: fields.status,
          error: fields.error ?? null,
          parentEventId: baseContext.parentEventId ?? null,
          instanceId: baseContext.instanceId ?? null,
        })
      }

      if (hasOwnWorkspaceMismatch(rawArgs, baseContext.workspaceId)) {
        record({ status: 'rejected', error: 'workspace_scope_mismatch' })
        throw new ToolWorkspaceError(definition.name)
      }

      if (definition.external) {
        if (!baseContext.tracker.canCallExternalTool()) {
          record({ status: 'blocked', error: 'budget_exhausted' })
          throw new ToolBudgetError(definition.name)
        }
        baseContext.tracker.recordExternalToolCall()
      }

      try {
        baseContext.tracker.recordToolUse?.(definition.name)
        const output = await definition.execute(rawArgs, ctx)
        record({ status: 'completed', output })
        return output
      } catch (error) {
        record({ status: 'error', error: errorText(error) })
        throw error
      }
    },
  } as unknown as Parameters<typeof tool>[0])
}

export type ToolRegistry = ReadonlyMap<string, ToolDefinition<never, unknown>>

export function createToolRegistry(
  definitions: ToolDefinition<any, any>[],
): ToolRegistry {
  const map = new Map<string, ToolDefinition<never, unknown>>()
  for (const definition of definitions) {
    if (!definition?.name) continue
    map.set(definition.name, definition as unknown as ToolDefinition<never, unknown>)
  }
  return map
}

/**
 * Build the AI SDK ToolSet an agent may use: only registry tools that are on the
 * role allowlist, each wrapped with validation, budgeting, and tracing.
 */
export function getToolsForRole(
  role: AgentRole,
  registry: ToolRegistry,
  context: Omit<ToolExecutionContext, 'signal'>,
): ToolSet {
  const tools: ToolSet = {}
  for (const name of ROLE_TOOL_ALLOWLIST[role] ?? []) {
    const definition = registry.get(name) as ToolDefinition<unknown, unknown> | undefined
    if (!definition) continue
    tools[name] = wrapTool(definition, context) as ToolSet[string]
  }
  return tools
}