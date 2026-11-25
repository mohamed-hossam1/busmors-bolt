import 'server-only'
import { createHash } from 'node:crypto'

/**
 * Roadmap learning-log → Business Brain promotion mapping (Phase 5).
 *
 * Pure helpers that build the exact `propose_brain_change` RPC payload for a
 * learning entry. The Brain is NEVER mutated directly: promotion only ever
 * creates a PENDING proposal through the existing SECURITY DEFINER RPC, which
 * the owner approves later. Keeping the mapping here (away from the route) makes
 * it unit-testable with zero live API calls.
 */

export const PROMOTABLE_CATEGORIES = [
  'company_fact',
  'audience',
  'offering',
  'positioning',
  'channel',
  'brand_rule',
  'strategic_goal',
] as const

export type PromotableCategory = (typeof PROMOTABLE_CATEGORIES)[number]

export function isPromotableCategory(value: unknown): value is PromotableCategory {
  return typeof value === 'string' && (PROMOTABLE_CATEGORIES as readonly string[]).includes(value)
}

export interface LearningForPromotion {
  id: string
  roadmap_id: string | null
  hypothesis: string
  experiment: string
  learning: string
  decision: string
}

export interface BrainProposalPayload {
  p_action: 'add'
  p_node_id: null
  p_title: string
  p_summary: string
  p_category: PromotableCategory
  p_properties: Record<string, unknown>
  p_old_values: null
  p_new_values: null
  p_source: string
  p_rationale: string
  p_source_refs: Array<{ kind: string; id: string; roadmapId: string | null }>
  p_fingerprint: string
}

export const LEARNING_BRAIN_SOURCE = 'Roadmap Learning Log'

/** Deterministic dedupe fingerprint for an identical pending Brain proposal. */
export function learningFingerprint(category: string, title: string, summary: string): string {
  return createHash('sha256').update(`${category}:${title}:${summary}`).digest('hex')
}

/**
 * Build the propose_brain_change payload for a learning entry. `p_action` is
 * always 'add' and `p_node_id` is always null: a learning promotes a brand new
 * fact, never edits/deletes an existing node, and never writes brain_nodes.
 */
export function buildBrainProposalPayload(
  entry: LearningForPromotion,
  input: { category?: unknown; title?: unknown; summary?: unknown },
): BrainProposalPayload {
  const category: PromotableCategory = isPromotableCategory(input.category) ? input.category : 'company_fact'
  const title = cleanText(input.title, 150) || cleanText(entry.hypothesis, 150) || 'Roadmap learning'
  const summary = cleanText(input.summary, 6000) || cleanText(entry.learning, 6000)

  return {
    p_action: 'add',
    p_node_id: null,
    p_title: title,
    p_summary: summary,
    p_category: category,
    p_properties: { origin: 'roadmap_learning_log', learningId: entry.id },
    p_old_values: null,
    p_new_values: null,
    p_source: LEARNING_BRAIN_SOURCE,
    p_rationale: cleanText(entry.learning, 4000),
    p_source_refs: [{ kind: 'roadmap_learning_log', id: entry.id, roadmapId: entry.roadmap_id }],
    p_fingerprint: learningFingerprint(category, title, summary),
  }
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}