import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import type { BrainCategory } from '../../../lib/types'
import type { BrainStore, ProposeBrainChangeInput } from '../brain-store'

/**
 * Orchestrator internal tools (Phase 2).
 *
 * The Orchestrator has zero skills and zero external tools. It exposes exactly
 * three internal capabilities, all `external: false`:
 *   - read_business_brain: read approved, current workspace facts (read-only),
 *   - propose_brain_change: create a pending owner-approval proposal (never
 *     applies or approves),
 *   - delegate_to_director: validated structured handoff. The Director is built
 *     in Phase 3, so this honestly reports temporary unavailability instead of
 *     simulating execution.
 *
 * Workspace scoping is enforced by the tool-registry wrapper (which rejects a
 * model-supplied workspaceId mismatch) and by the BrainStore, which is built
 * from the authenticated session. The model never supplies the workspace id.
 */

export const BRAIN_CATEGORIES = [
  'company_profile',
  'offering',
  'audience',
  'brand_rule',
  'positioning',
  'strategic_goal',
  'channel',
  'competitor',
  'company_fact',
] as const satisfies readonly BrainCategory[]

const categorySchema = z.enum(BRAIN_CATEGORIES)
const propertiesSchema = z.record(z.string(), z.unknown())

const readBusinessBrainInput = z.object({
  query: z.string().max(200).optional(),
  category: categorySchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const proposeBrainChangeInput = z.object({
  action: z.enum(['add', 'edit', 'delete']),
  nodeId: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(150),
  summary: z.string().max(6000),
  category: categorySchema,
  properties: propertiesSchema.optional(),
  oldValues: propertiesSchema.optional(),
  newValues: propertiesSchema.optional(),
  source: z.string().max(2000),
  rationale: z.string().max(4000),
  sourceRefs: z.array(z.string().max(500)).max(50).optional(),
  fingerprint: z.string().max(128).optional(),
})

/**
 * Structured Director handoff contract (spec 2.4). The runtime derives identity
 * and authorization; the handoff carries only task context. Every field that
 * affects the deliverable — original request, intended outcome, language,
 * constraints, task references and clearly labelled unapproved facts — is
 * preserved losslessly.
 */
export const DIRECTOR_HANDOFF_SCHEMA = z.object({
  originalRequest: z.string().min(1).max(6000),
  intendedOutcome: z.string().min(1).max(4000),
  outputLanguage: z.string().min(1).max(32),
  context: z.string().max(12000).optional(),
  constraints: z.string().max(4000).optional(),
  taskReferences: z.array(z.string().max(200)).max(50).optional(),
  unapprovedFacts: z
    .array(
      z.object({
        fact: z.string().min(1).max(2000),
        status: z.literal('unapproved'),
      }),
    )
    .max(50)
    .optional(),
})

export type DirectorHandoff = z.infer<typeof DIRECTOR_HANDOFF_SCHEMA>

export type ValidateHandoffResult =
  | { ok: true; value: DirectorHandoff }
  | { ok: false; error: string }

/** Validate a handoff payload, preserving language, context and unapproved facts. */
export function validateDirectorHandoff(input: unknown): ValidateHandoffResult {
  const parsed = DIRECTOR_HANDOFF_SCHEMA.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join('; ') }
  }
  return { ok: true, value: parsed.data }
}

export interface OrchestratorToolDeps {
  brain: BrainStore
}

export function createOrchestratorToolDefinitions(
  deps: OrchestratorToolDeps,
): ToolDefinition<any, any>[] {
  return [
    {
      name: 'read_business_brain',
      description:
        'Read approved, current Business Brain facts for this workspace. Read-only. Use it to answer business-specific questions accurately; never invent facts.',
      external: false,
      inputSchema: readBusinessBrainInput,
      execute: async (args: z.infer<typeof readBusinessBrainInput>) => {
        const facts = await deps.brain.readApproved(args.query, args.category, args.limit)
        return { facts }
      },
    },
    {
      name: 'propose_brain_change',
      description:
        'Propose a durable Business Brain addition, edit, or deletion for owner approval. Creates a pending approval card only; it never applies or approves the change. Include old/new values for edits, the source, and a rationale. Check for duplicates/conflicts first.',
      external: false,
      inputSchema: proposeBrainChangeInput,
      execute: async (args: z.infer<typeof proposeBrainChangeInput>) => {
        const input: ProposeBrainChangeInput = {
          action: args.action,
          nodeId: args.nodeId ?? null,
          title: args.title,
          summary: args.summary,
          category: args.category,
          properties: args.properties ?? null,
          oldValues: args.oldValues ?? null,
          newValues: args.newValues ?? null,
          source: args.source,
          rationale: args.rationale,
          sourceRefs: args.sourceRefs ?? [],
          fingerprint: args.fingerprint ?? null,
        }
        return deps.brain.proposeChange(input)
      },
    },
    {
      name: 'delegate_to_director',
      description:
        'Hand a substantive marketing task to the Director with a structured handoff (original request, intended outcome, context, constraints, output language, task references, and clearly labelled unapproved facts). The Director is not enabled yet, so this validates the handoff and reports temporary unavailability honestly.',
      external: false,
      inputSchema: DIRECTOR_HANDOFF_SCHEMA,
      execute: async (args: DirectorHandoff) => {
        const validated = validateDirectorHandoff(args)
        if (!validated.ok) {
          return { status: 'error', message: 'Invalid Director handoff.', error: validated.error }
        }
        return { status: 'unavailable', message: 'Director is not enabled yet' }
      },
    },
  ]
}

/** Names of the only tools the Orchestrator may use (no skills, no external tools). */
export const ORCHESTRATOR_TOOL_NAMES = [
  'read_business_brain',
  'propose_brain_change',
  'delegate_to_director',
] as const