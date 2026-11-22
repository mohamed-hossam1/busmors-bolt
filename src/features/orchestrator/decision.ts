// Pure decision normalization for the Orchestrator. Kept free of server-only
// imports so it can be unit-tested directly.
import { isDirectorIntent, isResearchMode, type OrchestratorDecision } from './contracts'

export const DIRECT_DEFAULT_REPLY = 'I didn’t quite catch that — could you tell me a little more about what you need?'

/** Normalize whatever the Orchestrator model returned into a safe decision. */
export function normalizeDecision(text: string): OrchestratorDecision {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text)
  } catch {
    const trimmed = text.trim()
    const reply = trimmed && !trimmed.startsWith('{') && !trimmed.startsWith('[') ? trimmed.slice(0, 12000) : DIRECT_DEFAULT_REPLY
    return { path: 'direct', reply, brainQuery: '', intent: 'simple_answer', quantity: 1, researchMode: 'standard' }
  }
  if (!raw || typeof raw !== 'object') {
    return { path: 'direct', reply: DIRECT_DEFAULT_REPLY, brainQuery: '', intent: 'simple_answer', quantity: 1, researchMode: 'standard' }
  }
  const path = raw.path === 'brain' || raw.path === 'task' ? raw.path : 'direct'
  const quantity = Math.min(12, Math.max(1, Math.floor(Number(raw.quantity) || 1)))
  return {
    path,
    reply: typeof raw.reply === 'string' ? raw.reply.slice(0, 12000) : '',
    brainQuery: typeof raw.brainQuery === 'string' ? raw.brainQuery.slice(0, 1000) : '',
    intent: isDirectorIntent(raw.intent) ? raw.intent : 'simple_answer',
    quantity,
    researchMode: isResearchMode(raw.researchMode) ? raw.researchMode : 'standard',
  }
}