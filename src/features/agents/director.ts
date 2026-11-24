/**
 * Director V1 runtime (spec §3). Uses the shared agent loop with the canonical
 * Director prompt, the 7 registered Director skills (lazy-loaded), the Director
 * tool allowlist, and centralized delegation to specialists.
 *
 * Only the Director delegates. Specialists report back; the Director reviews,
 * requests focused revisions when needed, synthesizes, and owns delivery.
 */

import type { AgentAction, AgentRole, SpecialistRole } from './contracts'
import { EvidenceLedger, extractHttpUrls } from './evidence'
import { runAgentLoop, type AgentRuntimeDeps, type AgentRuntimeResult, type RuntimeModelMessage, type RuntimeModelTurn } from './runtime'
import { ROLE_SYSTEM_PROMPTS } from './prompts'

export interface SpecialistSubtaskInput {
  goal: string
  scope: string
  contextBlock?: string
  requestedLanguage?: string
  revisionContext?: {
    previousSummary: string
    defect: string
    desired: string
  }
}

export interface SpecialistResult {
  instanceId?: string
  specialist: SpecialistRole
  status: string
  summary: string
  loadedSkills?: string[]
  invokedTools?: string[]
  evidenceRefs: string[]
  limitations: string[]
}

/** Mock/real specialist registry boundary. Only the Director calls this. */
export interface SpecialistRegistry {
  run(
    specialist: SpecialistRole,
    subtask: SpecialistSubtaskInput,
    ctx: { workspaceId: string; signal?: AbortSignal },
  ): Promise<SpecialistResult>
}

export interface DirectorDeps extends Omit<AgentRuntimeDeps, 'act'> {
  /** Read a registered Director skill body by id (lazy). */
  readSkill(id: string): Promise<{ id: string; version: string; contentHash: string; body: string } | null>
  /** Director tool allowlist executor (read/propose/persist + external stubs). */
  executeTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; output?: unknown; error?: string }>
  /** Specialist registry (mock in standalone tests). */
  specialists: SpecialistRegistry
  workspaceId: string
}

export interface DirectorInput {
  originalRequest: string
  intendedOutcome?: string
  contextBlock: string
  requestedLanguage?: string
  history?: { role: string; content: string }[]
  signal?: AbortSignal
}

export interface DirectorResult extends AgentRuntimeResult {
  role: AgentRole
  specialistResults: SpecialistResult[]
  evidenceRefs: string[]
  ungroundedUrls: string[]
}

export const DIRECTOR_SKILL_CATALOG = [
  { id: 'marketing-strategy', name: 'Marketing Strategy', description: 'Strategic choices, growth, segmentation, positioning, channel and resource priorities.' },
  { id: 'egyptian-market-business-intelligence', name: 'Egyptian Market & Business Intelligence', description: 'Local context lens when it materially affects a decision.' },
  { id: 'strategic-problem-solving', name: 'Strategic Problem Solving', description: 'Marketing problems, competing explanations, prioritization, experiments.' },
  { id: 'campaign-strategy', name: 'Campaign Strategy', description: 'Campaign objectives, audience, offer, funnel, channel and measurement design.' },
  { id: 'research-evidence-literacy', name: 'Research & Evidence Literacy', description: 'Narrow web lookup and evaluating sources/results.' },
  { id: 'marketing-performance-interpretation', name: 'Marketing Performance Interpretation', description: 'Interpret available metrics and translate results into decisions.' },
  { id: 'marketing-communication', name: 'Marketing Communication', description: 'Small copy, ideas, message evaluation and briefs.' },
]

function formatSpecialistFeedback(result: SpecialistResult): string {
  return JSON.stringify({
    instanceId: result.instanceId ?? null,
    specialist: result.specialist,
    status: result.status,
    loadedSkills: result.loadedSkills ?? [],
    invokedTools: result.invokedTools ?? [],
    evidenceRefs: result.evidenceRefs,
    limitations: result.limitations,
    summary: result.summary,
  })
}

export async function runDirector(input: DirectorInput, deps: DirectorDeps): Promise<DirectorResult> {
  const specialistResults: SpecialistResult[] = []
  const subtasks: { instanceId?: string; specialist: SpecialistRole; goal: string; scope: string }[] = []
  const ledger = new EvidenceLedger()
  ledger.seedKnownUrls(extractHttpUrls(input.contextBlock))

  const act = async (action: AgentAction): Promise<{ ok: boolean; content: string }> => {
    switch (action.type) {
      case 'read_skill': {
        const skill = await deps.readSkill(action.skillId)
        if (!skill) return { ok: false, content: `Skill ${action.skillId} is not registered.` }
        return { ok: true, content: `Loaded skill ${skill.id} (v${skill.version}):\n${skill.body}` }
      }
      case 'tool_call': {
        if (action.tool === 'create_or_version_deliverable') {
          const content = String(action.args.content ?? '')
          const ungrounded = ledger.findUngroundedUrls(content)
          if (ungrounded.length > 0) {
            return {
              ok: false,
              content: `Refused to persist Deliverable: it cites unretrieved external URL(s): ${ungrounded.join(', ')}. Retrieve real sources via Research Agent or web tools, or remove unverified URLs.`,
            }
          }
        }
        const result = await deps.executeTool(action.tool, action.args)
        ledger.recordToolOutcome(action.tool, action.args, result.ok, result.output)
        return result.ok ? { ok: true, content: JSON.stringify(result.output ?? {}) } : { ok: false, content: result.error ?? 'tool failed' }
      }
      case 'delegate': {
        const specialist = action.specialist as SpecialistRole
        if (!['research', 'content', 'marketing_analyst'].includes(specialist)) {
          return { ok: false, content: `Unknown specialist role: ${action.specialist}. Valid roles: research, content, marketing_analyst.` }
        }
        const result = await deps.specialists.run(
          specialist,
          {
            goal: action.goal,
            scope: action.scope,
            contextBlock: input.contextBlock,
            requestedLanguage: input.requestedLanguage,
          },
          { workspaceId: deps.workspaceId, signal: input.signal },
        )
        subtasks.push({ instanceId: result.instanceId, specialist, goal: action.goal, scope: action.scope })
        specialistResults.push(result)
        ledger.seedKnownUrls(result.evidenceRefs.filter((r) => /^https?:\/\//i.test(r)))
        return {
          ok: result.status === 'completed' || result.status === 'partial',
          content: formatSpecialistFeedback(result),
        }
      }
      case 'request_revision': {
        const target = action.targetInstanceId
        const prior =
          [...specialistResults].reverse().find((r) => r.instanceId === target) ??
          [...specialistResults].reverse().find((r) => r.specialist === target)
        if (!prior) {
          return { ok: false, content: `No prior specialist invocation matched "${target}".` }
        }
        const priorTask = [...subtasks].reverse().find((t) => (prior.instanceId && t.instanceId === prior.instanceId) || t.specialist === prior.specialist)
        const revised = await deps.specialists.run(
          prior.specialist,
          {
            goal: priorTask?.goal ?? action.desired,
            scope: priorTask?.scope ?? '',
            contextBlock: input.contextBlock,
            requestedLanguage: input.requestedLanguage,
            revisionContext: {
              previousSummary: prior.summary,
              defect: action.defect,
              desired: action.desired,
            },
          },
          { workspaceId: deps.workspaceId, signal: input.signal },
        )
        subtasks.push({ instanceId: revised.instanceId, specialist: prior.specialist, goal: priorTask?.goal ?? action.desired, scope: priorTask?.scope ?? '' })
        specialistResults.push(revised)
        ledger.seedKnownUrls(revised.evidenceRefs.filter((r) => /^https?:\/\//i.test(r)))
        return {
          ok: revised.status === 'completed' || revised.status === 'partial',
          content: formatSpecialistFeedback(revised),
        }
      }
      case 'stop_agent_work':
        return { ok: true, content: `Stopped ${action.targetInstanceId}: ${action.reason}` }
      case 'ask_clarification':
        return { ok: true, content: 'Clarification requested; entering Awaiting Input.' }
      case 'finish':
        return { ok: true, content: 'finish' }
      case 'answer':
        return { ok: true, content: 'answer' }
      default:
        return { ok: false, content: 'unsupported action' }
    }
  }

  const model: AgentRuntimeDeps['model'] = async (messages: RuntimeModelMessage[], signal?: AbortSignal): Promise<RuntimeModelTurn> => {
    return deps.model(messages, signal)
  }

  const result = await runAgentLoop(
    {
      role: 'director',
      systemPrompt: ROLE_SYSTEM_PROMPTS.director,
      skillCatalog: DIRECTOR_SKILL_CATALOG,
      contextBlock: input.contextBlock,
      task: input.intendedOutcome ? `${input.originalRequest}\n\nIntended outcome: ${input.intendedOutcome}` : input.originalRequest,
      history: input.history,
      signal: input.signal,
      gateCompletion: ({ text }) => {
        const ungrounded = ledger.findUngroundedUrls(text)
        if (ungrounded.length > 0) {
          return `Your response cites external URL(s) that were NOT retrieved by any real search/scrape tool: ${ungrounded.join(', ')}. Never invent or cite unretrieved URLs. Use Research Agent or web tools to retrieve real sources, or remove unverified URLs and state limitations honestly.`
        }
        return null
      },
      maxCompletionBlocks: 2,
    },
    { model, act, now: deps.now },
  )

  const ungroundedUrls = ledger.findUngroundedUrls(result.summary)
  const finalStatus = ungroundedUrls.length > 0 && result.status === 'completed' ? 'partial' : result.status

  return {
    ...result,
    status: finalStatus,
    role: 'director',
    specialistResults,
    evidenceRefs: ledger.retrievedUrls(),
    ungroundedUrls,
  }
}

/** A mock specialist registry for standalone Director tests (clearly labeled). */
export function mockSpecialistRegistry(responses: Partial<Record<SpecialistRole, SpecialistResult>> = {}): SpecialistRegistry {
  return {
    async run(specialist) {
      const preset = responses[specialist]
      if (preset) return preset
      return {
        instanceId: `mock-${specialist}`,
        specialist,
        status: 'completed',
        summary: `[MOCK specialist ${specialist}] No real specialist executed.`,
        loadedSkills: [],
        invokedTools: [],
        evidenceRefs: [],
        limitations: ['Mock specialist — not a real agent result.'],
      }
    },
  }
}
