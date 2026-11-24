import { num } from './contracts'
import type { ResultKind } from './contracts'

export const MESSAGING = 'onsite_conversion.messaging_conversation_started_7d'
export const RESULT_ACTION_TYPES = {
  messages: [MESSAGING],
  leads: ['lead', 'onsite_conversion.lead_grouped'],
  purchases: ['purchase', 'omni_purchase'],
} as const

export function actionValue(actions: unknown, types: readonly string[]): number | null {
  if (!Array.isArray(actions)) return null
  for (const type of types) {
    const match = (actions as unknown[]).find(
      (element) => typeof element === 'object' && element !== null && (element as Record<string, unknown>).action_type === type,
    )
    if (match) return num((match as Record<string, unknown>).value)
  }
  return null
}

export function resultForKind(kind: ResultKind, actions: unknown, clicks: number): number {
  if (kind === 'clicks') return clicks
  return actionValue(actions, RESULT_ACTION_TYPES[kind]) ?? 0
}

export function primaryResult(objective: string | null, actions: unknown, clicks: number): { kind: ResultKind; value: number } {
  if (objective === 'OUTCOME_LEADS' || objective === 'LEAD_GENERATION') {
    const leads = actionValue(actions, RESULT_ACTION_TYPES.leads)
    if (leads !== null) return { kind: 'leads', value: leads }
  }
  if (objective === 'OUTCOME_SALES' || objective === 'CONVERSIONS' || objective === 'PRODUCT_CATALOG_SALES') {
    const purchases = actionValue(actions, RESULT_ACTION_TYPES.purchases)
    if (purchases !== null) return { kind: 'purchases', value: purchases }
  }
  const messages = actionValue(actions, RESULT_ACTION_TYPES.messages)
  if (messages !== null) return { kind: 'messages', value: messages }
  return { kind: 'clicks', value: clicks }
}