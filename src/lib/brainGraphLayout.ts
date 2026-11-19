import type { BrainCategory, BrainNode } from './types'

export const BRAIN_CARD_WIDTH = 260
export const BRAIN_CARD_HEIGHT = 44
export const BRAIN_HUB_WIDTH = 230
export const BRAIN_HUB_HEIGHT = 50
export const BRAIN_CAT_WIDTH = 140
export const BRAIN_CAT_HEIGHT = 36

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

export interface BrainLayoutResult {
  positions: Map<string, { x: number; y: number }>
  hubId: string
  hubNode: BrainNode | null
  rightCategories: BrainCategory[]
  leftCategories: BrainCategory[]
}

/**
 * Bilateral mind-map layout radiating out from a central business hub.
 * Hub in center (x=0, y=0), categories branching to left and right with generous spacing,
 * and leaf knowledge item nodes stacked beside their respective category pills.
 */
export function calculateBrainPositions(nodes: BrainNode[]): BrainLayoutResult {
  const positions = new Map<string, { x: number; y: number }>()

  if (!nodes.length) {
    return {
      positions,
      hubId: '__business_hub__',
      hubNode: null,
      rightCategories: [],
      leftCategories: [],
    }
  }

  // Identify hub node (company profile if present)
  const hubNode = nodes.find((n) => n.category === 'company_profile') ?? null
  const hubId = hubNode ? hubNode.id : '__business_hub__'
  const remainingNodes = nodes.filter((n) => n.id !== hubNode?.id)

  // Center hub position
  positions.set(hubId, {
    x: -BRAIN_HUB_WIDTH / 2,
    y: -BRAIN_HUB_HEIGHT / 2,
  })

  // Get active categories with at least 1 remaining node
  const categoriesPresent = BRAIN_CATEGORY_ORDER.filter(
    (cat) => cat !== 'company_profile' && remainingNodes.some((n) => n.category === cat)
  )

  const ITEM_PITCH = 60
  const CAT_GAP = 44
  const MIN_CAT_BLOCK = 76

  // Distribute categories evenly between right and left sides
  // We sort by count descending and balance both item count and category count
  const sortedCategories = [...categoriesPresent].sort((a, b) => {
    const countA = remainingNodes.filter((n) => n.category === a).length
    const countB = remainingNodes.filter((n) => n.category === b).length
    return countB - countA
  })

  const rightCategories: BrainCategory[] = []
  const leftCategories: BrainCategory[] = []
  let rightHeight = 0
  let leftHeight = 0

  for (const cat of sortedCategories) {
    const count = remainingNodes.filter((n) => n.category === cat).length
    const blockH = Math.max(MIN_CAT_BLOCK, Math.max(0, count - 1) * ITEM_PITCH + BRAIN_CARD_HEIGHT) + CAT_GAP

    // Keep category count balanced (no side gets > 2 more categories than the other)
    if (rightCategories.length - leftCategories.length >= 2) {
      leftCategories.push(cat)
      leftHeight += blockH
    } else if (leftCategories.length - rightCategories.length >= 2) {
      rightCategories.push(cat)
      rightHeight += blockH
    } else if (rightHeight <= leftHeight) {
      rightCategories.push(cat)
      rightHeight += blockH
    } else {
      leftCategories.push(cat)
      leftHeight += blockH
    }
  }

  // Calculate total heights
  const computeSideHeight = (cats: BrainCategory[]) => {
    if (!cats.length) return 0
    return cats.reduce((sum, cat) => {
      const count = remainingNodes.filter((n) => n.category === cat).length
      const blockH = Math.max(MIN_CAT_BLOCK, Math.max(0, count - 1) * ITEM_PITCH + BRAIN_CARD_HEIGHT)
      return sum + blockH + CAT_GAP
    }, 0) - CAT_GAP
  }

  // Position Right Side
  const rightTotalHeight = computeSideHeight(rightCategories)
  let currentRightY = -rightTotalHeight / 2

  for (const cat of rightCategories) {
    const items = remainingNodes.filter((n) => n.category === cat)
    const blockHeight = Math.max(MIN_CAT_BLOCK, Math.max(0, items.length - 1) * ITEM_PITCH + BRAIN_CARD_HEIGHT)

    // Center single item or place multiple items
    if (items.length === 1) {
      const itemY = currentRightY + (blockHeight - BRAIN_CARD_HEIGHT) / 2
      positions.set(items[0].id, { x: 420, y: itemY })
      positions.set(`cat-${cat}`, { x: 190, y: currentRightY + (blockHeight - BRAIN_CAT_HEIGHT) / 2 })
    } else {
      items.forEach((node, i) => {
        positions.set(node.id, {
          x: 420,
          y: currentRightY + i * ITEM_PITCH,
        })
      })
      const firstItemY = currentRightY
      const lastItemY = currentRightY + (items.length - 1) * ITEM_PITCH
      const catY = (firstItemY + lastItemY + BRAIN_CARD_HEIGHT) / 2 - BRAIN_CAT_HEIGHT / 2
      positions.set(`cat-${cat}`, { x: 190, y: catY })
    }

    currentRightY += blockHeight + CAT_GAP
  }

  // Position Left Side
  const leftTotalHeight = computeSideHeight(leftCategories)
  let currentLeftY = -leftTotalHeight / 2

  for (const cat of leftCategories) {
    const items = remainingNodes.filter((n) => n.category === cat)
    const blockHeight = Math.max(MIN_CAT_BLOCK, Math.max(0, items.length - 1) * ITEM_PITCH + BRAIN_CARD_HEIGHT)

    if (items.length === 1) {
      const itemY = currentLeftY + (blockHeight - BRAIN_CARD_HEIGHT) / 2
      positions.set(items[0].id, { x: -420 - BRAIN_CARD_WIDTH, y: itemY })
      positions.set(`cat-${cat}`, { x: -190 - BRAIN_CAT_WIDTH, y: currentLeftY + (blockHeight - BRAIN_CAT_HEIGHT) / 2 })
    } else {
      items.forEach((node, i) => {
        positions.set(node.id, {
          x: -420 - BRAIN_CARD_WIDTH,
          y: currentLeftY + i * ITEM_PITCH,
        })
      })
      const firstItemY = currentLeftY
      const lastItemY = currentLeftY + (items.length - 1) * ITEM_PITCH
      const catY = (firstItemY + lastItemY + BRAIN_CARD_HEIGHT) / 2 - BRAIN_CAT_HEIGHT / 2
      positions.set(`cat-${cat}`, { x: -190 - BRAIN_CAT_WIDTH, y: catY })
    }

    currentLeftY += blockHeight + CAT_GAP
  }

  return {
    positions,
    hubId,
    hubNode,
    rightCategories,
    leftCategories,
  }
}
