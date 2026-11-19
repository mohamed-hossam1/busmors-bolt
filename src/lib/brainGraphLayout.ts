import type { BrainCategory, BrainNode } from './types'

export const BRAIN_CARD_WIDTH = 220
export const BRAIN_CARD_HEIGHT = 46

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

/**
 * Bilateral mind-map tree layout:
 * Business hub node in the center (if company_profile exists),
 * with categories and leaf nodes radiating out to left and right in elegant branches.
 */
export function calculateBrainPositions(nodes: BrainNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (!nodes.length) return positions

  // Single or pair: place centered
  if (nodes.length <= 2) {
    nodes.forEach((n, i) => {
      positions.set(n.id, { x: (i - 0.5) * (BRAIN_CARD_WIDTH + 60), y: 0 })
    })
    return positions
  }

  // Find center node (company profile if present)
  const hubNode = nodes.find((n) => n.category === 'company_profile') ?? null
  const remainingNodes = nodes.filter((n) => n.id !== hubNode?.id)

  if (hubNode) {
    positions.set(hubNode.id, { x: 0, y: 0 })
  }

  // Group remaining nodes by category
  const categoriesPresent = BRAIN_CATEGORY_ORDER.filter((cat) =>
    remainingNodes.some((n) => n.category === cat)
  )

  // Split categories bilaterally: right side vs left side
  const rightCategories: BrainCategory[] = []
  const leftCategories: BrainCategory[] = []

  categoriesPresent.forEach((cat, idx) => {
    if (idx % 2 === 0) {
      rightCategories.push(cat)
    } else {
      leftCategories.push(cat)
    }
  })

  const ITEM_Y_GAP = 58
  const CAT_GAP = 32

  // Calculate total height for right side
  let rightTotalHeight = 0
  for (const cat of rightCategories) {
    const items = remainingNodes.filter((n) => n.category === cat)
    rightTotalHeight += items.length * ITEM_Y_GAP + CAT_GAP
  }

  // Calculate total height for left side
  let leftTotalHeight = 0
  for (const cat of leftCategories) {
    const items = remainingNodes.filter((n) => n.category === cat)
    leftTotalHeight += items.length * ITEM_Y_GAP + CAT_GAP
  }

  // Place right side nodes
  let rightY = -rightTotalHeight / 2
  for (const cat of rightCategories) {
    const items = remainingNodes.filter((n) => n.category === cat)
    for (let i = 0; i < items.length; i++) {
      const node = items[i]
      positions.set(node.id, {
        x: hubNode ? 260 : 130,
        y: rightY + i * ITEM_Y_GAP,
      })
    }
    rightY += items.length * ITEM_Y_GAP + CAT_GAP
  }

  // Place left side nodes
  let leftY = -leftTotalHeight / 2
  for (const cat of leftCategories) {
    const items = remainingNodes.filter((n) => n.category === cat)
    for (let i = 0; i < items.length; i++) {
      const node = items[i]
      positions.set(node.id, {
        x: hubNode ? -260 - BRAIN_CARD_WIDTH : -130 - BRAIN_CARD_WIDTH,
        y: leftY + i * ITEM_Y_GAP,
      })
    }
    leftY += items.length * ITEM_Y_GAP + CAT_GAP
  }

  return positions
}
