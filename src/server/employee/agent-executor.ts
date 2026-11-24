import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentAction, SpecialistRole } from '../../features/agents/contracts'
import type { RuntimeModelMessage, RuntimeModelTurn } from '../../features/agents/runtime'
import { runDirector, type DirectorResult, type SpecialistRegistry } from '../../features/agents/director'
import { runSpecialist } from '../../features/agents/specialist'
import { callAgentRoleModel, type ToolDef } from '../orchestrator/model'
import { SkillRegistry } from './skills-registry'
import { buildToolRegistry } from './tools'
import { createToolServices } from './tool-services'
import type { ToolRegistry, ToolServices } from './tool-registry'
import type { ProviderAttemptInfo } from '../../lib/agents'

/** Parse a model turn (JSON action or plain text) into a runtime turn. */
export function parseAgentTurn(raw: string): RuntimeModelTurn {
  const text = raw.trim()
  if (!text) return { text: '', toolCalls: [] }
  try {
    const parsed = JSON.parse(text) as { action?: unknown; text?: unknown }
    if (parsed && typeof parsed === 'object' && parsed.action && typeof parsed.action === 'object') {
      const action = parsed.action as Record<string, unknown>
      const type = String(action.type ?? '')
      switch (type) {
        case 'answer':
          return { text: String(action.text ?? parsed.text ?? ''), action: { type: 'answer', text: String(action.text ?? parsed.text ?? '') } }
        case 'read_skill':
          return { text, action: { type: 'read_skill', skillId: String(action.skillId ?? '') } }
        case 'tool_call':
          return { text, action: { type: 'tool_call', tool: String(action.tool ?? ''), args: (action.args as Record<string, unknown>) ?? {} } }
        case 'ask_clarification':
          return { text, action: { type: 'ask_clarification', questions: [] } }
        case 'delegate':
          return { text, action: { type: 'delegate', specialist: String(action.specialist ?? '') as SpecialistRole, goal: String(action.goal ?? ''), scope: String(action.scope ?? '') } }
        case 'request_revision':
          return { text, action: { type: 'request_revision', targetInstanceId: String(action.targetInstanceId ?? ''), defect: String(action.defect ?? ''), desired: String(action.desired ?? '') } }
        case 'stop_agent_work':
          return { text, action: { type: 'stop_agent_work', targetInstanceId: String(action.targetInstanceId ?? ''), reason: String(action.reason ?? '') } }
        case 'finish':
          return { text, action: { type: 'finish', status: String(action.status ?? 'completed') as 'completed', summary: String(action.summary ?? '') } }
        default:
          return { text, toolCalls: [] }
      }
    }
  } catch { /* plain text */ }
  return { text, toolCalls: [] }
}

export interface AgentModelTraceInfo {
  role: string
  instanceId?: string
  provider?: string
  model?: string
  attempt?: number
  fallbackUsed?: boolean
  usage?: unknown
  usageKnown?: boolean
  status?: string
  errorCategory?: string | null
  startedAt: string
  endedAt: string
  error?: string | null
  input?: { systemPrompt?: string; userPrompt?: string } | null
  outputText?: string | null
}

export interface AgentToolTraceInfo {
  role: string
  instanceId?: string
  tool: string
  ok: boolean
  startedAt: string
  endedAt: string
  input?: unknown
  output?: unknown
  error?: string | null
}

export interface AgentSkillTraceInfo {
  role: string
  instanceId?: string
  skillId: string
  version?: string
  contentHash?: string
  ok: boolean
}

export interface AgentInstanceTraceInfo {
  role: string
  instanceId: string
  parentEventId?: string | null
  label?: string
  status: string
  startedAt?: string
  endedAt?: string
  input?: unknown
  output?: unknown
  error?: string | null
}

export interface AgentExecutorDeps {
  supabase: SupabaseClient
  workspaceId: string
  token: string
  signal?: AbortSignal
  /** Trace hooks (optional). */
  onModel?: (info: AgentModelTraceInfo) => void
  onTool?: (info: AgentToolTraceInfo) => void
  onSkill?: (info: AgentSkillTraceInfo) => void
  onAgent?: (info: AgentInstanceTraceInfo) => void
}

const ROLE_LABELS: Record<'director' | SpecialistRole, string> = {
  director: 'Director',
  research: 'Research Agent',
  content: 'Content Agent',
  marketing_analyst: 'Marketing Analyst',
}

/** Build the OpenAI tool catalog exposed to a role (skills + registry tools + coordination). */
export function buildRoleOpenAiTools(
  role: 'director' | SpecialistRole,
  registry: ToolRegistry,
  skills: SkillRegistry,
): ToolDef[] {
  const defs: ToolDef[] = []
  const roleSkills = skills.catalogForRole(role)
  if (roleSkills.length > 0) {
    defs.push({
      name: 'read_skill',
      description: 'Load the full SKILL.md domain instructions and quality checks for a relevant skill from your catalog before executing. Choose only skills relevant to the task.',
      parameters: {
        type: 'object',
        properties: {
          skillId: {
            type: 'string',
            enum: roleSkills.map((s) => s.id),
            description: 'Registered skill ID to load.',
          },
        },
        required: ['skillId'],
      },
    })
  }

  for (const t of registry.catalogForRole(role)) {
    defs.push({
      name: t.name,
      description: t.description,
      parameters: t.schema,
    })
  }

  if (role === 'director') {
    defs.push(
      {
        name: 'delegate_agent',
        description: 'Delegate a bounded subtask to a specialist (research, content, or marketing_analyst). You may call multiple specialists in parallel when independent.',
        parameters: {
          type: 'object',
          properties: {
            specialist: { type: 'string', enum: ['research', 'content', 'marketing_analyst'] },
            goal: { type: 'string', description: 'Clear objective, context, constraints, and expected deliverable.' },
            scope: { type: 'string', description: 'Bounded scope and output format.' },
          },
          required: ['specialist', 'goal', 'scope'],
        },
      },
      {
        name: 'request_agent_revision',
        description: 'Request a focused revision from a specialist after reviewing its returned output.',
        parameters: {
          type: 'object',
          properties: {
            targetInstanceId: { type: 'string', description: 'The specialist instanceId (or role) to revise.' },
            defect: { type: 'string', description: 'Concrete defect or missing evidence/requirement.' },
            desired: { type: 'string', description: 'Specific correction required.' },
          },
          required: ['targetInstanceId', 'defect', 'desired'],
        },
      },
      {
        name: 'stop_agent_work',
        description: 'Stop unproductive specialist work cleanly.',
        parameters: {
          type: 'object',
          properties: {
            targetInstanceId: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['targetInstanceId', 'reason'],
        },
      },
      {
        name: 'ask_clarification',
        description: 'Ask the owner essential clarifying questions only when meaningful progress is blocked without an answer.',
        parameters: {
          type: 'object',
          properties: {
            questions: { type: 'array', items: { type: 'object' }, description: 'List of concise clarification questions.' },
          },
          required: ['questions'],
        },
      },
    )
  } else {
    defs.push(
      {
        name: 'ask_clarification',
        description: 'Request clarification or missing information from the Director when blocked.',
        parameters: {
          type: 'object',
          properties: {
            questions: { type: 'array', items: { type: 'object' }, description: 'Clarifying questions for the Director.' },
          },
          required: ['questions'],
        },
      },
      {
        name: 'finish',
        description: 'Finish the specialist assignment explicitly with status completed, partial (when evidence/data is genuinely limited), or failed.',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['completed', 'partial', 'failed'] },
            summary: { type: 'string', description: 'Final structured specialist report.' },
          },
          required: ['status', 'summary'],
        },
      },
    )
  }

  return defs
}

export function emitModelAttempts(
  onModel: AgentExecutorDeps['onModel'],
  role: string,
  instanceId: string | undefined,
  systemPrompt: string,
  userPrompt: string,
  result: {
    ok: boolean
    text: string
    provider?: string
    model?: string
    attempt?: number
    fallbackUsed?: boolean
    usage?: unknown
    usageKnown?: boolean
    reason?: string
    error?: string
    attempts?: ProviderAttemptInfo[]
  },
  startedAt: string,
  endedAt: string,
): void {
  if (!onModel) return
  const attempts = result.attempts
  if (attempts && attempts.length > 0) {
    for (const att of attempts) {
      onModel({
        role,
        instanceId,
        provider: att.provider,
        model: att.model,
        attempt: att.attemptIndex,
        fallbackUsed: att.fallbackUsed,
        usage: att.usageKnown ? att.usage : null,
        usageKnown: att.usageKnown,
        status: att.status,
        errorCategory: att.errorCategory ?? null,
        startedAt: att.startedAt,
        endedAt: att.endedAt,
        error: att.error ?? null,
        input: { systemPrompt, userPrompt },
        outputText: att.status === 'completed' ? result.text : null,
      })
    }
    return
  }
  onModel({
    role,
    instanceId,
    provider: result.provider,
    model: result.model,
    attempt: result.attempt,
    fallbackUsed: result.fallbackUsed,
    usage: result.usageKnown ? result.usage : null,
    usageKnown: result.usageKnown ?? Boolean(result.usage),
    status: result.ok ? 'completed' : 'failed',
    startedAt,
    endedAt,
    error: result.ok ? null : result.reason ?? result.error ?? 'provider_error',
    input: { systemPrompt, userPrompt },
    outputText: result.ok ? result.text : null,
  })
}

export function createRoleModelAdapter(
  deps: AgentExecutorDeps,
  role: 'director' | SpecialistRole,
  tools: ToolDef[],
  instanceId?: string,
) {
  return async (messages: RuntimeModelMessage[], signal?: AbortSignal): Promise<RuntimeModelTurn> => {
    const startedAt = new Date().toISOString()
    const systemPrompt = messages.find((m) => m.role === 'system')?.content ?? ''
    const serializedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.name ? { name: m.name } : {}),
    }))
    const lastInput = messages.filter((m) => m.role !== 'system').slice(-1)[0]?.content ?? ''

    const result = await callAgentRoleModel({
      role,
      systemPrompt,
      messages: serializedMessages,
      tools,
      jsonMode: false,
      accessToken: deps.token,
      signal: signal ?? deps.signal,
    })

    emitModelAttempts(deps.onModel, role, instanceId, systemPrompt, lastInput, result, startedAt, new Date().toISOString())
    if (!result.ok) throw new Error(result.reason ?? 'provider_error')

    if (result.toolCalls && result.toolCalls.length > 0) {
      return {
        text: result.text,
        toolCalls: result.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args })),
      }
    }
    return parseAgentTurn(result.text)
  }
}

/** Build a SpecialistRegistry backed by the real specialist runtime and hierarchical tracing. */
export function createSpecialistRegistry(
  deps: AgentExecutorDeps,
  skills: SkillRegistry,
  parentInstanceId?: string,
): SpecialistRegistry {
  const services = createToolServices(deps.supabase, deps.workspaceId)
  const registry = buildToolRegistry(services)
  return {
    async run(specialist, subtask) {
      const specialistInstanceId = crypto.randomUUID()
      const startedAt = new Date().toISOString()
      deps.onAgent?.({
        role: specialist,
        instanceId: specialistInstanceId,
        parentEventId: parentInstanceId ?? null,
        label: ROLE_LABELS[specialist],
        status: 'running',
        startedAt,
        input: { goal: subtask.goal, scope: subtask.scope, isRevision: Boolean(subtask.revisionContext) },
      })

      const tools = buildRoleOpenAiTools(specialist, registry, skills)
      const result = await runSpecialist(
        specialist,
        {
          goal: subtask.goal,
          scope: subtask.scope,
          contextBlock: subtask.contextBlock ?? 'Approved Business Brain and workspace context are available via tools.',
          requestedLanguage: subtask.requestedLanguage,
          revisionContext: subtask.revisionContext,
          signal: deps.signal,
        },
        {
          model: createRoleModelAdapter(deps, specialist, tools, specialistInstanceId),
          now: Date.now,
          readSkill: async (id) => {
            const loaded = await skills.readSkill(id)
            if (!loaded) return null
            deps.onSkill?.({ role: specialist, instanceId: specialistInstanceId, skillId: id, version: loaded.meta.version, contentHash: loaded.meta.contentHash, ok: true })
            return { id, version: loaded.meta.version, contentHash: loaded.meta.contentHash, body: loaded.body }
          },
          executeTool: async (name, args) => {
            const toolStartedAt = new Date().toISOString()
            const r = await registry.execute(specialist, name, args, { workspaceId: deps.workspaceId, instanceId: specialistInstanceId, signal: deps.signal, services: services as ToolServices })
            deps.onTool?.({ role: specialist, instanceId: specialistInstanceId, tool: name, ok: r.ok, startedAt: toolStartedAt, endedAt: new Date().toISOString(), input: args, output: r.ok ? r.output : undefined, error: r.ok ? null : r.error })
            return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error }
          },
        },
      )

      deps.onAgent?.({
        role: specialist,
        instanceId: specialistInstanceId,
        parentEventId: parentInstanceId ?? null,
        label: ROLE_LABELS[specialist],
        status: result.status,
        endedAt: new Date().toISOString(),
        output: {
          status: result.status,
          summary: result.summary,
          loadedSkills: result.loadedSkills,
          invokedTools: result.invokedTools,
          evidenceRefs: result.evidenceRefs,
          limitations: result.limitations,
        },
      })

      return {
        instanceId: specialistInstanceId,
        specialist,
        status: result.status,
        summary: result.summary,
        loadedSkills: result.loadedSkills,
        invokedTools: result.invokedTools,
        evidenceRefs: result.evidenceRefs,
        limitations: result.limitations,
      }
    },
  }
}

/** Run the Director with real model, skills, tools and specialist delegation. */
export async function executeDirector(
  deps: AgentExecutorDeps,
  skills: SkillRegistry,
  input: {
    directorInstanceId?: string
    originalRequest: string
    intendedOutcome?: string
    contextBlock: string
    requestedLanguage?: string
  },
): Promise<DirectorResult> {
  const services = createToolServices(deps.supabase, deps.workspaceId)
  const registry = buildToolRegistry(services)
  const directorTools = buildRoleOpenAiTools('director', registry, skills)
  const directorInstanceId = input.directorInstanceId ?? 'director-exec'

  return runDirector(
    {
      originalRequest: input.originalRequest,
      intendedOutcome: input.intendedOutcome,
      contextBlock: input.contextBlock,
      requestedLanguage: input.requestedLanguage,
      signal: deps.signal,
    },
    {
      model: createRoleModelAdapter(deps, 'director', directorTools, directorInstanceId),
      now: Date.now,
      readSkill: async (id) => {
        const loaded = await skills.readSkill(id)
        if (!loaded) return null
        deps.onSkill?.({ role: 'director', instanceId: directorInstanceId, skillId: id, version: loaded.meta.version, contentHash: loaded.meta.contentHash, ok: true })
        return { id, version: loaded.meta.version, contentHash: loaded.meta.contentHash, body: loaded.body }
      },
      executeTool: async (name, args) => {
        const startedAt = new Date().toISOString()
        const r = await registry.execute('director', name, args, { workspaceId: deps.workspaceId, instanceId: directorInstanceId, signal: deps.signal, services })
        deps.onTool?.({ role: 'director', instanceId: directorInstanceId, tool: name, ok: r.ok, startedAt, endedAt: new Date().toISOString(), input: args, output: r.ok ? r.output : undefined, error: r.ok ? null : r.error })
        return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error }
      },
      specialists: createSpecialistRegistry(deps, skills, directorInstanceId),
      workspaceId: deps.workspaceId,
    },
  )
}

export type { AgentAction }
