/**
 * Shared model-directed Agent Runtime loop (spec §3.6, §4.5, §5.5, §6.6; plan §1A).
 *
 * A bounded model-action-result loop reusable by every LLM role. The model is
 * shown the role prompt, a compact skill catalog, trusted context and the tool
 * catalog; it chooses the next action via native tool calls (or structured JSON
 * action for application-mediated calling). The runtime validates and executes
 * each action, then feeds the ACTUAL outcome back into the model context.
 * No fabricated intermediate steps.
 */

import type { AgentAction, AgentRole, SpecialistRole, TaskStatus } from './contracts'

export interface RuntimeModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  name?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
}

export interface RuntimeToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface RuntimeModelTurn {
  text: string
  /** Structured action the model chose (application-mediated calling). */
  action?: AgentAction
  /** Or native tool calls (normalized to actions by the runtime). */
  toolCalls?: RuntimeToolCall[]
}

export interface AgentRuntimeDeps {
  /** One model turn given the running transcript. */
  model(messages: RuntimeModelMessage[], signal?: AbortSignal): Promise<RuntimeModelTurn>
  /** Execute a validated action; returns the actual result to feed back. */
  act(action: AgentAction): Promise<{ ok: boolean; content: string }>
  now(): number
}

export interface CompletionGateContext {
  invokedTools: Set<string>
  loadedSkills: Set<string>
  status: TaskStatus
  text: string
}

export interface AgentRuntimeInput {
  role: AgentRole
  systemPrompt: string
  /** Compact skill catalog (name + short description only). */
  skillCatalog: { id: string; name: string; description: string }[]
  /** Trusted context block (data, not instructions). */
  contextBlock: string
  /** The delegated task / user request. */
  task: string
  history?: { role: string; content: string }[]
  signal?: AbortSignal
  /**
   * Deterministic completion gate (not intelligence): return a corrective message
   * to BLOCK a final answer/finish and force more grounded work, or null to allow.
   * Bounded by maxCompletionBlocks.
   */
  gateCompletion?: (state: CompletionGateContext) => string | null
  maxCompletionBlocks?: number
}

export interface AgentRuntimeResult {
  status: TaskStatus
  summary: string
  /** Skill ids actually and successfully loaded (distinct). */
  loadedSkills: string[]
  /** Tool names actually invoked. */
  invokedTools: string[]
  /** Whether the model asked for clarification (runtime enters Awaiting Input). */
  awaitingInput: boolean
  /** Delegated subtasks requested by this agent (Director only). */
  delegations: { specialist: string; goal: string; scope: string }[]
  steps: number
}

const MAX_STEPS = 24

function skillCatalogBlock(catalog: AgentRuntimeInput['skillCatalog']): string {
  if (catalog.length === 0) return 'Skills: (none)'
  return [
    'Registered domain skills (when one or more apply to this task, call `read_skill` first to load its methodology before executing; load only relevant ones):',
    ...catalog.map((s) => `- ${s.id}: ${s.description}`),
  ].join('\n')
}

function historyBlock(history: { role: string; content: string }[] | undefined): string {
  if (!history || history.length === 0) return ''
  return ['\nRecent conversation (untrusted context):', ...history.slice(-6).map((h) => `${h.role}: ${h.content.slice(0, 800)}`)].join('\n')
}

function toolCallToAction(tc: RuntimeToolCall): AgentAction {
  const args = tc.args ?? {}
  switch (tc.name) {
    case 'read_skill':
      return { type: 'read_skill', skillId: String(args.skillId ?? '') }
    case 'delegate_agent':
    case 'delegate':
      return {
        type: 'delegate',
        specialist: String(args.specialist ?? '') as SpecialistRole,
        goal: String(args.goal ?? ''),
        scope: String(args.scope ?? ''),
      }
    case 'request_agent_revision':
    case 'request_revision':
      return {
        type: 'request_revision',
        targetInstanceId: String(args.targetInstanceId ?? args.specialist ?? ''),
        defect: String(args.defect ?? ''),
        desired: String(args.desired ?? ''),
      }
    case 'stop_agent_work':
      return {
        type: 'stop_agent_work',
        targetInstanceId: String(args.targetInstanceId ?? ''),
        reason: String(args.reason ?? ''),
      }
    case 'ask_clarification':
      return {
        type: 'ask_clarification',
        questions: Array.isArray(args.questions) ? args.questions : [],
      }
    case 'finish':
      return {
        type: 'finish',
        status: String(args.status ?? 'completed') as TaskStatus,
        summary: String(args.summary ?? ''),
      }
    case 'answer':
      return {
        type: 'answer',
        text: String(args.text ?? ''),
      }
    default:
      return { type: 'tool_call', tool: tc.name, args }
  }
}

function isTerminalAction(action: AgentAction): boolean {
  return action.type === 'ask_clarification' || action.type === 'finish' || action.type === 'answer' || action.type === 'stop_agent_work'
}

/**
 * Run the bounded agent loop. Returns a structured result; never throws for a
 * model/tool failure (those become an honest failed/partial result).
 */
export async function runAgentLoop(
  input: AgentRuntimeInput,
  deps: AgentRuntimeDeps,
): Promise<AgentRuntimeResult> {
  const loadedSkills = new Set<string>()
  const invokedTools = new Set<string>()
  const delegations: { specialist: string; goal: string; scope: string }[] = []
  let awaitingInput = false
  let lastText = ''
  let steps = 0
  let completionBlocks = 0
  const maxCompletionBlocks = input.maxCompletionBlocks ?? 3

  const gate = (status: TaskStatus, text: string): string | null => {
    if (!input.gateCompletion) return null
    return input.gateCompletion({ invokedTools, loadedSkills, status, text })
  }

  const messages: RuntimeModelMessage[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: `${skillCatalogBlock(input.skillCatalog)}\n\n${input.contextBlock}${historyBlock(input.history)}\n\nTask: ${input.task}` },
  ]

  for (let step = 0; step < MAX_STEPS; step++) {
    if (input.signal?.aborted) {
      return { status: 'interrupted', summary: lastText || 'Interrupted.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
    }
    steps = step + 1
    let turn: RuntimeModelTurn
    try {
      turn = await deps.model(messages, input.signal)
    } catch (error) {
      return { status: 'failed', summary: lastText || `Model error: ${error instanceof Error ? error.message : 'unknown'}`, loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
    }
    if (turn.text) lastText = turn.text

    // 1. Native OpenAI tool-calling turn (supports multiple parallel tool calls).
    const toolCalls = Array.isArray(turn.toolCalls) ? turn.toolCalls : []
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: turn.text ?? '',
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        })),
      })

      const mapped = toolCalls.map((tc) => ({ tc, action: toolCallToAction(tc) }))
      const nonTerminal = mapped.filter((m) => !isTerminalAction(m.action))
      const terminal = mapped.filter((m) => isTerminalAction(m.action))

      const nonTerminalOutcomes = await Promise.all(
        nonTerminal.map(async ({ tc, action }) => ({ tc, action, result: await deps.act(action) })),
      )

      for (const { tc, action, result } of nonTerminalOutcomes) {
        const cap = action.type === 'read_skill' ? 10000 : 6000
        messages.push({
          role: 'tool',
          toolCallId: tc.id,
          name: tc.name,
          content: result.content.slice(0, cap),
        })
        if (action.type === 'read_skill' && result.ok) loadedSkills.add(action.skillId)
        else if (action.type === 'tool_call' && result.ok) invokedTools.add(action.tool)
        else if (action.type === 'delegate' && result.ok) delegations.push({ specialist: action.specialist, goal: action.goal, scope: action.scope })
        else if (action.type === 'request_revision' && !result.ok) {
          return { status: 'partial', summary: lastText || 'Revision failed.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
        }
      }

      if (terminal.length > 0) {
        for (const { tc, action } of terminal) {
          const result = await deps.act(action)
          if (action.type === 'ask_clarification') {
            messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: result.content.slice(0, 4000) })
            awaitingInput = true
            return { status: 'awaiting_input', summary: lastText || 'Awaiting clarification.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
          }
          if (action.type === 'stop_agent_work') {
            messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: result.content.slice(0, 4000) })
            return { status: 'partial', summary: lastText || 'Stopped.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
          }
          if (action.type === 'finish' || action.type === 'answer') {
            const candidateStatus: TaskStatus = action.type === 'finish' ? action.status : 'completed'
            const candidateText = (action.type === 'finish' ? action.summary : action.text) || lastText
            const block = gate(candidateStatus, candidateText)
            if (block) {
              if (completionBlocks < maxCompletionBlocks) {
                completionBlocks += 1
                messages.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: block.slice(0, 4000) })
                continue
              }
              return { status: 'partial', summary: candidateText || 'Incomplete: required evidence was not gathered.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
            }
            return { status: candidateStatus, summary: candidateText, loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
          }
        }
      }
      continue
    }

    // 2. Application-mediated single structured action OR final plain-text reply.
    const action = turn.action
    if (!action) {
      if (turn.text.trim()) {
        const candidateText = turn.text.trim()
        const block = gate('completed', candidateText)
        if (block) {
          if (completionBlocks < maxCompletionBlocks) {
            completionBlocks += 1
            messages.push({ role: 'assistant', content: turn.text.slice(0, 600) + (turn.text.length > 600 ? '… [rejected by runtime check]' : '') })
            messages.push({ role: 'user', content: `[Runtime check] ${block.slice(0, 4000)}` })
            continue
          }
          return { status: 'partial', summary: lastText || 'Incomplete: required evidence was not gathered.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
        }
        return { status: 'completed', summary: candidateText, loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
      }
      return { status: 'failed', summary: lastText || 'No actionable response.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
    }

    // Record the assistant action.
    messages.push({ role: 'assistant', content: turn.text || JSON.stringify(action) })

    const result = await deps.act(action)
    const cap = action.type === 'read_skill' ? 10000 : 6000
    messages.push({ role: 'user', content: `[Action ${action.type} result]: ${result.content.slice(0, cap)}` })

    switch (action.type) {
      case 'read_skill':
        if (result.ok) loadedSkills.add(action.skillId)
        break
      case 'tool_call':
        if (result.ok) invokedTools.add(action.tool)
        break
      case 'ask_clarification':
        awaitingInput = true
        return { status: 'awaiting_input', summary: lastText || 'Awaiting clarification.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
      case 'delegate':
        if (result.ok) delegations.push({ specialist: action.specialist, goal: action.goal, scope: action.scope })
        break
      case 'request_revision':
        if (!result.ok) return { status: 'partial', summary: lastText || 'Revision failed.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
        break
      case 'stop_agent_work':
        return { status: 'partial', summary: lastText || 'Stopped.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
      case 'finish': {
        const candidateText = lastText || action.summary
        const block = gate(action.status, candidateText)
        if (block) {
          if (completionBlocks < maxCompletionBlocks) {
            completionBlocks += 1
            messages.push({ role: 'user', content: `[Runtime check] ${block.slice(0, 4000)}` })
            break
          }
          return { status: 'partial', summary: candidateText || 'Incomplete: required evidence was not gathered.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
        }
        return { status: action.status, summary: candidateText, loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
      }
      case 'answer': {
        const candidateText = action.text || lastText
        const block = gate('completed', candidateText)
        if (block) {
          if (completionBlocks < maxCompletionBlocks) {
            completionBlocks += 1
            messages.push({ role: 'user', content: `[Runtime check] ${block.slice(0, 4000)}` })
            break
          }
          return { status: 'partial', summary: candidateText || 'Incomplete: required evidence was not gathered.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
        }
        return { status: 'completed', summary: candidateText, loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
      }
    }
  }

  return { status: 'partial', summary: lastText || 'Reached the step limit.', loadedSkills: [...loadedSkills], invokedTools: [...invokedTools], awaitingInput, delegations, steps }
}
