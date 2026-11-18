import type { BrainCategory, BrainNode } from './types'

export const BRAIN_CARD_WIDTH = 260
export const BRAIN_CARD_HEIGHT = 148

export const BRAIN_CATEGORY_ORDER: BrainCategory[] = [
  'company_profile',
  'offering',
  'audience',
  'positioning',
  'brand_rule',
  'strategic_goal',
  'company_fact',
  'channel',
  'competitor',
]

/** Fixed card dimensions and gutters keep every category clear of its neighbors. */
export function calculateBrainPositions(nodes: BrainNode[]) {
  const ordered = [...nodes].sort((a, b) =>
    BRAIN_CATEGORY_ORDER.indexOf(a.category) - BRAIN_CATEGORY_ORDER.indexOf(b.category)
    || a.title.localeCompare(b.title)
    || a.id.localeCompare(b.id)
  )
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(ordered.length))))
  return new Map(ordered.map((node, index) => [node.id, {
    x: (index % columns) * (BRAIN_CARD_WIDTH + 72),
    y: Math.floor(index / columns) * (BRAIN_CARD_HEIGHT + 72),
  }]))
}
