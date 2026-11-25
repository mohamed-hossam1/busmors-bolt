import { z } from 'zod'
import type { ToolDefinition } from '../tool-registry'
import type { BrainStore } from '../brain-store'
import type { CalendarStore, DeliverableStore } from '../director-store'
import type { LoadedSkill } from '../skill-loader'

/**
 * Content Agent tools (Phase 5 Part A, spec 5).
 *
 * The Content Agent is a strictly READ-ONLY creative specialist. Every
 * capability below is one of the allowlisted logical contracts from the spec:
 *   read_skill, read_business_brain, read_deliverables, read_calendar,
 *   get_task_context.
 *
 * There is NO Calendar/Brain/Deliverable write tool, NO publishing or
 * scheduling, NO ask_clarification (the Director owns user contact), NO
 * delegate_agent (no specialist-to-specialist calls) and NO web tools. The
 * agent reads only approved context and returns structured creative drafts to
 * the Director, who alone persists and delivers.
 *
 * Workspace scoping is enforced by the tool-registry wrapper (it rejects a
 * model-supplied workspaceId mismatch) and by the stores, which are built from
 * the authenticated session. The model never supplies the workspace id.
 */

export type ContentStatus =
  | 'completed'
  | 'partial'
  | 'failed'
  | 'awaiting_input'
  | 'cancelled'

/** The bounded assignment the Director hands to the Content Agent. */
export interface ContentAssignment {
  goal: string
  scope?: string
  context?: string
  outputLanguage?: string
}

export type ContentItemType = 'post_draft' | 'variant' | 'script' | 'brief' | 'plan'

export type ContentReadiness = 'draft_ready' | 'needs_assets' | 'placeholder' | 'idea'

/** A single structured creative item returned to the Director (never persisted). */
export interface ContentDraft {
  /** Stable item id for revision references (model-supplied). */
  id: string
  itemType: ContentItemType
  /** Target platform when relevant; never a fabricated destination. */
  platform: string
  title: string
  /** The actual customer-facing copy (kept separate from internal notes). */
  body: string
  hook?: string
  cta?: string
  hashtags?: string
  visualBrief?: string
  language?: string
  /** A PROPOSED time in Africa/Cairo (or ISO/note); never an actual schedule. */
  proposedTime?: string
  readiness: ContentReadiness
  sourceRefs: string[]
  /** Set only when revising an existing calendar draft the Director owns. */
  postId?: string
}

/** A prior creative result reused on a targeted revision (never re-derived). */
export interface ContentPriorResult {
  drafts?: ContentDraft[]
  notes?: string[]
  limitations?: string[]
  text?: string
}

/** The bounded delegated scope + prior drafts exposed via get_task_context. */
export interface ContentTaskContext {
  assignment: ContentAssignment
  priorDrafts: ContentDraft[]
  revisionFeedback?: string
}

export interface ContentToolDeps {
  brain: BrainStore
  deliverables: DeliverableStore
  calendar: CalendarStore
  /** Loads a registered Content skill (bound to the run's skill-load tracker). */
  loadSkill: (skillId: string) => Promise<LoadedSkill>
  /** Bounded delegated scope + prior drafts for get_task_context. */
  taskContext: ContentTaskContext
}

const readBusinessBrainInput = z.object({})

const readSkillInput = z.object({
  skillId: z.string().min(1).max(128),
})

const readDeliverablesInput = z.object({
  limit: z.number().int().min(1).max(50).optional(),
})

const readCalendarInput = z.object({
  limit: z.number().int().min(1).max(50).optional(),
})

export function createContentToolDefinitions(deps: ContentToolDeps): ToolDefinition<any, any>[] {
  return [
    {
      name: 'read_skill',
      description:
        'Load one registered Content skill by id (from the compact catalog) when its methodology is needed. Returns the full skill body. Only registered Content skills can be read; repeated reads in one run are deduplicated.',
      external: false,
      inputSchema: readSkillInput,
      execute: async (args: z.infer<typeof readSkillInput>) => {
        const skill = await deps.loadSkill(args.skillId)
        return {
          id: skill.id,
          name: skill.name,
          version: skill.version,
          newlyLoaded: skill.newlyLoaded,
          content: skill.content,
        }
      },
    },
    {
      name: 'read_business_brain',
      description:
        'Read ALL approved, current Business Brain facts for this workspace (returns the complete Business Brain with no category/query filter, read-only). Use approved facts as authoritative business knowledge; never invent facts.',
      external: false,
      inputSchema: readBusinessBrainInput,
      execute: async () => {
        const facts = await deps.brain.readApproved()
        return { facts }
      },
    },
    {
      name: 'read_deliverables',
      description:
        'Read existing Deliverables (title, type, version, date) for this workspace so you can reuse authorized prior outputs and keep brand/offer consistency. Read-only.',
      external: false,
      inputSchema: readDeliverablesInput,
      execute: async (args: z.infer<typeof readDeliverablesInput>) => {
        const deliverables = await deps.deliverables.readRecent(args.limit)
        return { deliverables }
      },
    },
    {
      name: 'read_calendar',
      description:
        'Read existing planned Calendar drafts (platform, caption, status, proposed time, version) for this workspace so new drafts avoid topic duplication and respect cadence. Read-only; never schedules or publishes.',
      external: false,
      inputSchema: readCalendarInput,
      execute: async (args: z.infer<typeof readCalendarInput>) => {
        const drafts = await deps.calendar.readDrafts(args.limit)
        return { drafts }
      },
    },
    {
      name: 'get_task_context',
      description:
        'Return the bounded delegated scope, constraints, prior drafts and revision feedback passed by the Director (never unrestricted conversation history). Use it to stay within the assignment and to reuse valid prior creative work on a revision.',
      external: false,
      inputSchema: z.object({}),
      execute: async () => deps.taskContext,
    },
  ]
}

/** Names of the only tools the Content Agent may use (read-only, no writes). */
export const CONTENT_TOOL_NAMES = [
  'read_skill',
  'read_business_brain',
  'read_deliverables',
  'read_calendar',
  'get_task_context',
] as const