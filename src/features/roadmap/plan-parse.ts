import type { RoadmapPlan, RoadmapPlanStep } from './types'

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}
export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
export function asStringList(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, max)
    : []
}

/**
 * Normalize one model-produced roadmap step into a validated, bounded shape.
 * Returns null when the step has no usable title. Pure and shared by the
 * roadmap generator and the revision adapter so parsing stays consistent.
 */
export function normalizePlanStep(raw: unknown, index: number): RoadmapPlanStep | null {
  const step = asRecord(raw)
  const title = asString(step.title).trim()
  if (!title) return null
  return {
    key: asString(step.key).trim() || `step_${index + 1}`,
    title: title.slice(0, 300),
    objective: asString(step.objective).slice(0, 2000),
    rationale: asString(step.rationale).slice(0, 2000),
    evidence: asArray(step.evidence),
    uncertainty: asString(step.uncertainty).slice(0, 1000),
    responsibility: step.responsibility === 'system' ? 'system' : 'owner',
    executionMode: step.executionMode === 'director' ? 'director' : 'owner',
    inputs: asArray(step.inputs),
    dependencies: asStringList(step.dependencies).filter((item) => item.length > 0),
    expectedOutput: asString(step.expectedOutput).slice(0, 2000),
    checklist: asStringList(step.checklist, 20),
    effort: asString(step.effort).trim().slice(0, 200) || 'Not estimated',
    externalApproval: typeof step.externalApproval === 'string' && step.externalApproval.trim()
      ? step.externalApproval.trim().slice(0, 500)
      : null,
    milestoneKey: asString(step.milestoneKey).trim().slice(0, 120) || undefined,
    successCriteria: asString(step.successCriteria).slice(0, 2000),
    priority: ['critical', 'high', 'medium', 'low'].includes(asString(step.priority)) ? asString(step.priority) : 'medium',
    metric: asString(step.metric).slice(0, 300),
    dueHint: asString(step.dueHint).slice(0, 200),
  }
}

export interface NormalizedPlan extends RoadmapPlan {
  diff: Record<string, unknown>
}

/**
 * Validate and bound a full model-produced plan. Throws-free: returns null steps
 * are dropped and the caller decides whether an empty result is an error.
 * Shared by generation and revision paths.
 */
export function normalizePlan(raw: unknown, goalLabel: string): NormalizedPlan {
  const root = asRecord(raw)
  const steps = asArray(root.steps)
    .map((item, index) => normalizePlanStep(item, index))
    .filter((item): item is RoadmapPlanStep => item !== null)
    .slice(0, 12)
  return {
    title: asString(root.title).trim().slice(0, 300) || 'Business roadmap',
    summary: asString(root.summary).slice(0, 4000),
    uncertainty: asString(root.uncertainty).slice(0, 2000),
    goalLabel,
    diagnosis: asRecord(root.diagnosis) as unknown as RoadmapPlan['diagnosis'],
    objective: asRecord(root.objective) as unknown as RoadmapPlan['objective'],
    metrics: asArray(root.metrics).map(asRecord) as unknown as RoadmapPlan['metrics'],
    priorities: asArray(root.priorities).map(asRecord) as unknown as RoadmapPlan['priorities'],
    milestones: asArray(root.milestones).map(asRecord) as unknown as RoadmapPlan['milestones'],
    risks: asArray(root.risks).map(asRecord) as unknown as RoadmapPlan['risks'],
    review: asRecord(root.review) as unknown as RoadmapPlan['review'],
    steps,
    contextRefs: [],
    diff: asRecord(root.diff),
  }
}