import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SpecialistRole } from '../../features/agents/contracts'
import {
  buildRoleOpenAiTools,
  createRoleModelAdapter,
  executeDirector,
  type AgentInstanceTraceInfo,
  type AgentModelTraceInfo,
  type AgentSkillTraceInfo,
  type AgentToolTraceInfo,
} from './agent-executor'
import { runSpecialist } from '../../features/agents/specialist'
import { SkillRegistry } from './skills-registry'
import { createToolServices } from './tool-services'
import { buildToolRegistry } from './tools'

export type AcceptanceAgent = 'director' | SpecialistRole

export interface AcceptanceRunInput {
  supabase: SupabaseClient
  workspaceId: string
  token: string
  conversationId: string | null
  agent: AcceptanceAgent
  request: string
  intendedOutcome?: string
  contextBlock?: string
  instanceId?: string
  signal?: AbortSignal
  onModel?: (info: AgentModelTraceInfo) => void
  onTool?: (info: AgentToolTraceInfo) => void
  onSkill?: (info: AgentSkillTraceInfo) => void
  onAgent?: (info: AgentInstanceTraceInfo) => void
}

export interface AcceptanceRunResult {
  agent: AcceptanceAgent
  status: string
  summary: string
  loadedSkills: string[]
  invokedTools: string[]
  evidenceRefs: string[]
  limitations: string[]
  specialistResults: {
    instanceId?: string
    specialist: string
    status: string
    summary: string
    loadedSkills?: string[]
    invokedTools?: string[]
    evidenceRefs: string[]
    limitations: string[]
  }[]
}

/** Run one Employee agent standalone for acceptance (test mode only, gated by the route). */
export async function runAcceptanceAgent(deps: AcceptanceRunInput): Promise<AcceptanceRunResult> {
  const skills = await SkillRegistry.create()
  const services = createToolServices(deps.supabase, deps.workspaceId)
  const registry = buildToolRegistry(services)
  const rootInstanceId = deps.instanceId ?? crypto.randomUUID()

  if (deps.agent === 'director') {
    const result = await executeDirector(
      {
        supabase: deps.supabase,
        workspaceId: deps.workspaceId,
        token: deps.token,
        signal: deps.signal,
        onModel: deps.onModel,
        onTool: deps.onTool,
        onSkill: deps.onSkill,
        onAgent: deps.onAgent,
      },
      skills,
      {
        directorInstanceId: rootInstanceId,
        originalRequest: deps.request,
        intendedOutcome: deps.intendedOutcome,
        contextBlock: deps.contextBlock ?? 'Approved Business Brain and workspace context are available via tools.',
        requestedLanguage: undefined,
      },
    )
    return {
      agent: 'director',
      status: result.status,
      summary: result.summary,
      loadedSkills: result.loadedSkills,
      invokedTools: result.invokedTools,
      evidenceRefs: result.evidenceRefs,
      limitations: result.ungroundedUrls.length > 0 ? [`Contains unverified URL(s): ${result.ungroundedUrls.join(', ')}`] : [],
      specialistResults: result.specialistResults.map((s) => ({
        instanceId: s.instanceId,
        specialist: s.specialist,
        status: s.status,
        summary: s.summary,
        loadedSkills: s.loadedSkills,
        invokedTools: s.invokedTools,
        evidenceRefs: s.evidenceRefs,
        limitations: s.limitations,
      })),
    }
  }

  // Specialist standalone.
  const role = deps.agent
  const tools = buildRoleOpenAiTools(role, registry, skills)
  const result = await runSpecialist(
    role,
    {
      goal: deps.request,
      scope: deps.intendedOutcome ?? '',
      contextBlock: deps.contextBlock ?? 'Approved Business Brain and workspace context are available via tools.',
      signal: deps.signal,
    },
    {
      model: createRoleModelAdapter(deps, role, tools, rootInstanceId),
      now: Date.now,
      readSkill: async (id) => {
        const loaded = await skills.readSkill(id)
        if (!loaded) return null
        deps.onSkill?.({ role, instanceId: rootInstanceId, skillId: id, version: loaded.meta.version, contentHash: loaded.meta.contentHash, ok: true })
        return { id, version: loaded.meta.version, contentHash: loaded.meta.contentHash, body: loaded.body }
      },
      executeTool: async (name, args) => {
        const startedAt = new Date().toISOString()
        const r = await registry.execute(role, name, args, { workspaceId: deps.workspaceId, instanceId: rootInstanceId, signal: deps.signal, services })
        deps.onTool?.({ role, instanceId: rootInstanceId, tool: name, ok: r.ok, startedAt, endedAt: new Date().toISOString(), input: args, output: r.ok ? r.output : undefined, error: r.ok ? null : r.error })
        return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error }
      },
    },
  )
  return {
    agent: role,
    status: result.status,
    summary: result.summary,
    loadedSkills: result.loadedSkills,
    invokedTools: result.invokedTools,
    evidenceRefs: result.evidenceRefs,
    limitations: result.limitations,
    specialistResults: [],
  }
}
