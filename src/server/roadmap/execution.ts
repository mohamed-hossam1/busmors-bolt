/**
 * Roadmap step execution helpers (Phase 4).
 *
 * Pure, framework-free builders shared by the step-action API route and the
 * unit tests. No `server-only` import so the deterministic prompt/origin logic
 * can be imported directly in tests with zero live API calls.
 */

export type DirectorHandoffKind = 'research' | 'analysis' | 'content'

export interface RoadmapStepOrigin {
  kind: 'roadmap_step'
  roadmapId: string
  planVersionId: string
  stepId: string
  actionKind: DirectorHandoffKind
}

export interface RoadmapStepOriginInput {
  roadmapId: string
  planVersionId: string
  stepId: string
  actionKind: DirectorHandoffKind
}

/** Build the `origin` object recorded on step_actions/deliverables/posts. */
export function buildRoadmapStepOrigin(input: RoadmapStepOriginInput): RoadmapStepOrigin {
  return {
    kind: 'roadmap_step',
    roadmapId: input.roadmapId,
    planVersionId: input.planVersionId,
    stepId: input.stepId,
    actionKind: input.actionKind,
  }
}

export interface DirectorPromptInput {
  actionKind: DirectorHandoffKind
  stepTitle: string
  objective?: string
  expectedOutput?: string
  successCriteria?: string
  locale?: string
}

/**
 * Build a structured handoff prompt for the Marketing Director, tailored to the
 * step's action kind.
 *
 * - research / analysis: run the research/analysis (delegating to the Research
 *   Agent or using the Director's research tools) and save the full report to
 *   Deliverables, referencing this roadmap step.
 * - content: produce publishable content drafts with the post-draft tools so the
 *   posts land as Calendar drafts with proposed timing, preserving the existing
 *   two-step approval flow (never auto-publishing).
 */
export function buildDirectorPrompt(input: DirectorPromptInput): string {
  const language = input.locale === 'ar' ? 'Arabic' : 'English'
  const lines: string[] = []
  lines.push(`Write all user-facing output in ${language}.`)
  lines.push('')
  lines.push(`Roadmap step: ${input.stepTitle}`)
  if (input.objective) lines.push(`Objective: ${input.objective}`)
  if (input.expectedOutput) lines.push(`Expected output: ${input.expectedOutput}`)
  if (input.successCriteria) lines.push(`Success criteria: ${input.successCriteria}`)
  lines.push('')

  if (input.actionKind === 'content') {
    lines.push(
      'Create publishable content drafts for this step. Use your post-draft / Content workflow tools so each post is saved as a Calendar draft with proposed timing.',
    )
    lines.push(
      'Do NOT publish or auto-approve anything: the owner must review and approve in the existing two-step flow. Keep every post in draft/pending approval.',
    )
    lines.push(
      'When you save the drafts, reference this roadmap step in their origin so they link back to the roadmap.',
    )
  } else {
    const verb = input.actionKind === 'analysis' ? 'analysis' : 'research'
    lines.push(
      `Run the ${verb} for this step. Delegate to the Research Agent when appropriate, or execute it with your own research tools.`,
    )
    lines.push(
      'Save the full report to Deliverables (a research report / analysis document) and reference this roadmap step in its origin so it links back to the roadmap.',
    )
    lines.push(
      'Separate verified facts from hypotheses and unknowns. Never fabricate numbers; if a value is unknown, say so explicitly.',
    )
  }

  lines.push('')
  lines.push(
    'Do not claim the step is complete: the owner confirms completion separately. Produce the output and stop.',
  )
  return lines.join('\n')
}