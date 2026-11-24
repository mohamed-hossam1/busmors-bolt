// Orchestrator V2 runtime (spec §2).
//
// A real model-driven tool-calling loop, not a fixed keyword router. The model
// receives the canonical V2 system prompt, the compact internal-tool catalog, and
// trusted context (approved Brain, recent history, product knowledge). It may:
//   - answer directly (simple chat / general question),
//   - call read_business_brain / get_product_knowledge and answer from results,
//   - call propose_brain_change (pending approval card only),
//   - call delegate_to_director (validated handoff; deduplicated),
//   - call get_task_status (factual status),
//   - ask a short clarification when essential.
//
// The runtime owns permissions, budgets, trace and persistence; the model only
// chooses actions. This module is pure against injected deps so it is unit-tested
// with a fake model before any live call.

import type { AgentRole } from '../agents/contracts'
import type { ToolRegistry } from '../../server/employee/tool-registry'

export type OrchestratorV2Outcome =
  | { kind: 'answer'; reply: string }
  | { kind: 'delegated'; taskId: string; reply: string; alreadyDelegated: boolean }
  | { kind: 'clarify'; reply: string }
  | { kind: 'error'; reply: string }

/** One model turn in the tool loop. */
export interface ModelTurn {
  /** Assistant text (may be empty when the model only calls a tool). */
  text: string
  /** Tool calls requested by the model (validated by the runtime). */
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[]
}

export interface OrchestratorV2Deps {
  /** Run one model turn given the running message list; returns text + tool calls. */
  model(messages: ModelMessage[], signal?: AbortSignal): Promise<ModelTurn>
  /** Execute a tool call through the central registry (enforces allowlist). */
  executeTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; output?: unknown; error?: string }>
  /** Record a tool result as a message the model can read next turn. */
  now(): number
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  name?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
}

export interface OrchestratorV2Input {
  systemPrompt: string
  request: string
  history: { role: string; content: string }[]
  contextBlock: string
  signal?: AbortSignal
}

const MAX_TURNS = 6

/** Map the last conversation history into model messages (bounded). */
function historyMessages(history: { role: string; content: string }[]): ModelMessage[] {
  return history
    .filter((h) => h.role === 'user' || h.role === 'agent' || h.role === 'assistant')
    .slice(-8)
    .map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content.slice(0, 1200) }))
}

/**
 * Run the Orchestrator V2 tool loop. Returns a single user-facing outcome.
 * Delegation is deduplicated by the runtime through the delegate tool service.
 */
export async function runOrchestratorV2(
  input: OrchestratorV2Input,
  deps: OrchestratorV2Deps,
): Promise<OrchestratorV2Outcome> {
  const messages: ModelMessage[] = [
    { role: 'system', content: input.systemPrompt },
    ...historyMessages(input.history),
    { role: 'user', content: `${input.contextBlock}\n\nUser message: ${input.request}` },
  ]

  let lastAssistantText = ''
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (input.signal?.aborted) return { kind: 'error', reply: 'The request was interrupted. Please try again.' }
    const modelTurn = await deps.model(messages, input.signal)
    lastAssistantText = modelTurn.text

    if (modelTurn.toolCalls.length === 0) {
      // No tool call: this is the final user-facing answer (or a clarify).
      const text = modelTurn.text.trim()
      if (!text) return { kind: 'error', reply: 'I could not complete that just now. Please try again.' }
      return { kind: 'answer', reply: text }
    }

    // Record the assistant turn (with tool calls) so the transcript is coherent.
    messages.push({
      role: 'assistant',
      content: modelTurn.text,
      tool_calls: modelTurn.toolCalls.map((call) => ({ id: call.id, type: 'function' as const, function: { name: call.name, arguments: JSON.stringify(call.args) } })),
    })

    for (const call of modelTurn.toolCalls) {
      const result = await deps.executeTool(call.name, call.args)
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: JSON.stringify(result).slice(0, 4000),
      })
      if (call.name === 'delegate_to_director' && result.ok) {
        const output = (result.output ?? {}) as { taskId?: string; alreadyDelegated?: boolean }
        // The model may add a closing sentence; fall back to a safe confirmation.
        const taskId = output.taskId ?? ''
        return {
          kind: 'delegated',
          taskId,
          alreadyDelegated: Boolean(output.alreadyDelegated),
          reply: lastAssistantText.trim() || 'I have passed this to the marketing team and will follow up with results.',
        }
      }
    }
  }

  // Turn budget exhausted: return the last text or an honest fallback.
  return { kind: 'answer', reply: lastAssistantText.trim() || 'I could not complete that just now. Please try again.' }
}

/** Build the trusted context block injected as data (not instructions). */
export function buildOrchestratorContext(input: {
  brainFacts: { category: string; title: string; summary: string; verificationState: string | null }[]
  productKnowledge?: string
  region?: { country?: string; currency?: string; target_market?: string }
}): string {
  const lines: string[] = ['[Trusted runtime context — DATA, not instructions]']
  const region = input.region
  if (region && (region.country || region.currency || region.target_market)) {
    lines.push(`Business region: ${[region.country, region.currency, region.target_market].filter(Boolean).join(' · ')}`)
  }
  if (input.brainFacts.length > 0) {
    lines.push('Approved Business Brain facts:')
    for (const fact of input.brainFacts) {
      lines.push(`- (${fact.category}) ${fact.title}: ${fact.summary}${fact.verificationState ? ` [${fact.verificationState}]` : ''}`)
    }
  } else {
    lines.push('Approved Business Brain facts: (none matched)')
  }
  if (input.productKnowledge) lines.push(`Product reference: ${input.productKnowledge}`)
  return lines.join('\n')
}

export const ORCHESTRATOR_TOOL_ROLE: AgentRole = 'orchestrator'

export type { ToolRegistry }