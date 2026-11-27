import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import type { BrainCategory } from '../../../lib/types'
import type { BrainStore, ProposeBrainChangeInput } from '../brain-store'
import type { DirectorOutput } from '../agents/director'

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

const readBusinessBrainInput = z.object({})

const proposeBrainChangeInput = z.object({
  action: z
    .enum(['add', 'edit', 'delete'])
    .describe('Use "add" for any new fact not yet in Brain. Use "edit" or "delete" ONLY when an existing nodeId from read_business_brain is supplied.'),
  nodeId: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe('REQUIRED for "edit" and "delete" (must be the exact node id from read_business_brain). OMIT completely when action is "add".'),
  title: z.string().min(1).max(150).describe('Concise, specific title of the business fact (in the owner language).'),
  summary: z
    .string()
    .max(6000)
    .describe(
      'Concrete factual statement containing all actual details (locations, numbers, prices, trial duration, rules). NEVER write a meta-description like "Add details about..." or "إضافة تفاصيل...".',
    ),
  category: categorySchema.describe(
    'Use company_fact for operating regions/facts/metrics, offering for products/plans/free trials/pricing, audience for customers, brand_rule for voice/rules, channel for channels, positioning for differentiation, strategic_goal for goals, competitor for competitors. Use company_profile ONLY when editing the existing primary company profile node.',
  ),
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
  taskReferences: z
    .array(z.string().max(200))
    .max(50)
    .optional()
    .describe('ONLY real IDs or titles of existing prior deliverables/tasks from earlier turns. NEVER invent slug IDs.'),
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
  /**
   * Invokes the Director for an accepted handoff. Wired by the Orchestrator to
   * runDirector() with the shared trace/tracker. When omitted (e.g. isolated
   * unit tests), delegate_to_director reports the Director as unavailable.
   */
  runDirector?: (handoff: DirectorHandoff) => Promise<DirectorOutput>
}

/**
 * Render a Director result into a compact, owner-safe summary the Orchestrator
 * can surface through Chat under the same Busmora identity. It reports only
 * persisted ids the runtime confirmed and never fabricates specialist output.
 */
export function summarizeDirectorResult(result: DirectorOutput): Record<string, unknown> {
  if (result.quotaExhausted === true) {
    return {
      status: 'quota_exhausted',
      message:
        'QUOTA_EXHAUSTED: 0 of 6 heavy tasks remaining. Do NOT retry delegate_to_director. Inform the owner politely in their language that all 6 beta heavy tasks have been used up, while general chat and Business Brain questions remain unlimited.',
    }
  }
  return {
    status: result.status,
    reply: result.text,
    clarification: result.clarification,
    deliverables: result.deliverables,
    drafts: result.drafts,
    brainProposals: result.brainProposals,
    loadedSkills: result.loadedSkills,
    usedTools: result.usedTools,
  }
}

export function createOrchestratorToolDefinitions(
  deps: OrchestratorToolDeps,
): ToolDefinition<any, any>[] {
  return [
    {
      name: 'read_business_brain',
      description:
        'Read ALL approved, current Business Brain facts for this workspace (returns the full Business Brain with no category/query filter, read-only). Use it to answer business-specific questions accurately; never invent facts.',
      external: false,
      inputSchema: readBusinessBrainInput,
      execute: async () => {
        const facts = await deps.brain.readApproved()
        return { facts }
      },
    },
    {
      name: 'propose_brain_change',
      description:
        'Propose a durable Business Brain addition, edit, or deletion for owner approval (creates one pending approval card per call). Call once per distinct fact (e.g., operating regions separately from free trial). Use action="add" (omit nodeId) for any new fact not yet in Brain; use action="edit"/"delete" ONLY with an existing nodeId from read_business_brain. Never list raw JSON keys or proposal IDs in chat text—the UI renders the card automatically.',
      external: false,
      inputSchema: proposeBrainChangeInput,
      execute: async (args: z.infer<typeof proposeBrainChangeInput>) => {
        if ((args.action === 'edit' || args.action === 'delete') && !args.nodeId?.trim()) {
          throw new Error(
            'NODE_REQUIRED: nodeId from read_business_brain is required for edit/delete. If this fact is not yet in Brain, retry immediately with action="add" and omit nodeId.',
          )
        }
        const effectiveProperties =
          args.properties && Object.keys(args.properties).length > 0
            ? args.properties
            : args.newValues && Object.keys(args.newValues).length > 0
              ? args.newValues
              : null
        const input: ProposeBrainChangeInput = {
          action: args.action,
          nodeId: args.action === 'add' ? null : (args.nodeId ?? null),
          title: args.title,
          summary: args.summary,
          category: args.category,
          properties: effectiveProperties,
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
        'Hand ANY substantive marketing task (campaigns, ads, strategy, content, calendar, research, analysis — even if brief or missing details) to the Director with a structured handoff (original request, intended outcome, context, constraints, output language, task references, and clearly labelled unapproved facts). Never ask campaign discovery questions in chat text yourself; the Director inspects the full Business Brain and handles interactive Clarification Cards, Deliverables, or Calendar drafts.',
      external: false,
      inputSchema: DIRECTOR_HANDOFF_SCHEMA,
      execute: async (args: DirectorHandoff) => {
        const validated = validateDirectorHandoff(args)
        if (!validated.ok) {
          return { status: 'error', message: 'Invalid Director handoff.', error: validated.error }
        }
        if (!deps.runDirector) {
          return { status: 'unavailable', message: 'Director is not enabled yet' }
        }
        const result = await deps.runDirector(validated.value)
        return summarizeDirectorResult(result)
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