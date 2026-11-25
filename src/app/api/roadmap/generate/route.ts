import { requireApiIdentity, apiError } from '@/server/auth'
import { answerLabel, isOpenStatus, isPositiveStatus, localizeQuestionSchema } from '@/features/roadmap/discovery'
import type { DiscoveryAnswerValue, DiscoveryQuestionSchema } from '@/features/roadmap/types'
import { isDeliverableStale } from '@/server/roadmap/prefill'
import {
  buildRoadmapPersistencePayload,
  generateRoadmapPlan,
  type RoadmapGenerateAnswer,
  type RoadmapGenerateBrainNode,
  type RoadmapGenerateDeliverable,
  type RoadmapGeneratePriorLearning,
} from '@/server/roadmap/generate'

export const maxDuration = 120

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface GenerateRequestBody {
  draftId?: unknown
  locale?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * POST /api/roadmap/generate
 *
 * Builds a structured roadmap from the workspace's Discovery (partial answers
 * allowed), approved Business Brain, recent non-stale Deliverables and prior
 * archived-roadmap learnings, then atomically persists it as the single active
 * roadmap via create_generated_roadmap.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => ({}))) as GenerateRequestBody
    const locale = body.locale === 'ar' ? 'ar' : 'en'
    const requestedDraftId = typeof body.draftId === 'string' && UUID_RE.test(body.draftId) ? body.draftId : null

    const draftRes = requestedDraftId
      ? await supabase.from('discovery_drafts').select('*').eq('id', requestedDraftId).eq('workspace_id', user.id).maybeSingle()
      : await supabase
          .from('discovery_drafts')
          .select('*')
          .eq('workspace_id', user.id)
          .in('status', ['draft', 'planned'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

    if (draftRes.error) throw draftRes.error
    const draft = asRecord(draftRes.data)
    if (!draft.id || draft.status === 'archived') {
      return Response.json(
        { error: 'Start Discovery before generating a roadmap.' },
        { status: 400 },
      )
    }
    const draftId = String(draft.id)
    const goal = typeof draft.goal === 'string' && draft.goal ? draft.goal : 'something_else'

    const [questionsRes, brainRes, deliverableRes, archivedRes] = await Promise.all([
      supabase
        .from('discovery_questions')
        .select('question_key,status,value,schema,position,active')
        .eq('workspace_id', user.id)
        .eq('draft_id', draftId)
        .eq('active', true)
        .order('position', { ascending: true })
        .limit(100),
      supabase
        .from('brain_nodes')
        .select('id,title,summary,category,version')
        .eq('workspace_id', user.id)
        .eq('status', 'approved')
        .eq('is_current', true)
        .order('updated_at', { ascending: false })
        .limit(60),
      supabase
        .from('deliverables')
        .select('id,title,type,version,content,stale_reason,updated_at')
        .eq('workspace_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('roadmaps')
        .select('id,goal,updated_at')
        .eq('workspace_id', user.id)
        .eq('status', 'archived')
        .order('updated_at', { ascending: false })
        .limit(3),
    ])

    if (questionsRes.error) throw questionsRes.error
    if (brainRes.error) throw brainRes.error
    if (deliverableRes.error) throw deliverableRes.error
    if (archivedRes.error) throw archivedRes.error

    const answers: RoadmapGenerateAnswer[] = []
    const openUnknowns: string[] = []
    for (const row of questionsRes.data ?? []) {
      const record = asRecord(row)
      const questionKey = typeof record.question_key === 'string' ? record.question_key : ''
      if (!questionKey) continue
      const schema = (record.schema ?? {}) as DiscoveryQuestionSchema
      const localized = localizeQuestionSchema(questionKey, schema, locale)
      const status = typeof record.status === 'string' ? record.status : 'unanswered'
      const value = (record.value ?? null) as DiscoveryAnswerValue | null
      if (isPositiveStatus(status)) {
        const text = answerLabel(value, localized)
        if (text) answers.push({ questionKey, label: localized.label, status, answer: text })
      } else if (isOpenStatus(status)) {
        openUnknowns.push(localized.label)
      }
    }

    const brain: RoadmapGenerateBrainNode[] = (brainRes.data ?? []).map((row) => {
      const r = asRecord(row)
      return {
        id: String(r.id ?? ''),
        title: typeof r.title === 'string' ? r.title : '',
        summary: typeof r.summary === 'string' ? r.summary : '',
        category: typeof r.category === 'string' ? r.category : '',
        version: typeof r.version === 'number' ? r.version : 1,
      }
    }).filter((node) => node.id && node.title)

    const deliverables: RoadmapGenerateDeliverable[] = (deliverableRes.data ?? []).map((row) => {
      const r = asRecord(row)
      const content = typeof r.content === 'string' ? r.content : ''
      const updatedAt = typeof r.updated_at === 'string' ? r.updated_at : ''
      const staleReason = typeof r.stale_reason === 'string' ? r.stale_reason : null
      return {
        id: String(r.id ?? ''),
        title: typeof r.title === 'string' ? r.title : '',
        type: typeof r.type === 'string' ? r.type : 'general',
        version: typeof r.version === 'number' ? r.version : 1,
        summary: content.slice(0, 400),
        stale: isDeliverableStale({ staleReason, updatedAt }),
        updatedAt,
      }
    }).filter((deliverable) => deliverable.id && deliverable.title)

    const priorLearnings = await loadPriorLearnings(supabase, user.id, archivedRes.data ?? [])

    const result = await generateRoadmapPlan({
      workspaceId: user.id,
      locale,
      goal,
      goalLabel: goal,
      answers,
      openUnknowns,
      brain,
      deliverables,
      priorLearnings,
    })

    const payload = buildRoadmapPersistencePayload(result.plan, result.usedBrainNodes)
    const nextReviewAt = new Date(
      Date.now() + result.plan.reviewCadence.intervalDays * 24 * 60 * 60 * 1000,
    ).toISOString()

    const saved = await supabase.rpc('create_generated_roadmap', {
      p_draft_id: draftId,
      p_expected_draft_version: typeof draft.version === 'number' ? draft.version : 1,
      p_goal: goal,
      p_summary: payload.summary,
      p_steps: payload.steps,
      p_context_refs: payload.contextRefs,
      p_review_cadence_days: result.plan.reviewCadence.intervalDays,
      p_next_review_at: nextReviewAt,
    })
    if (saved.error) throw saved.error

    const data = asRecord(saved.data)
    return Response.json({
      roadmap: data.roadmap ?? null,
      activeVersion: data.activeVersion ?? null,
      steps: Array.isArray(data.steps) ? data.steps : [],
      staleDependencies: [],
    })
  } catch (error) {
    return apiError(error)
  }
}

type MinimalSupabase = Awaited<ReturnType<typeof requireApiIdentity>>['supabase']

async function loadPriorLearnings(
  supabase: MinimalSupabase,
  workspaceId: string,
  archived: unknown[],
): Promise<RoadmapGeneratePriorLearning[]> {
  const ids = archived
    .map((row) => asRecord(row))
    .map((r) => String(r.id ?? ''))
    .filter(Boolean)
  if (ids.length === 0) return []

  const [versionsRes, stepsRes] = await Promise.all([
    supabase
      .from('roadmap_versions')
      .select('roadmap_id,summary')
      .in('roadmap_id', ids)
      .order('version', { ascending: false })
      .limit(20),
    supabase
      .from('roadmap_steps')
      .select('roadmap_id,title,milestone_title,status')
      .in('roadmap_id', ids)
      .order('position', { ascending: true })
      .limit(100),
  ])
  if (versionsRes.error) throw versionsRes.error
  if (stepsRes.error) throw stepsRes.error

  const goalById = new Map<string, string>()
  for (const row of archived) {
    const r = asRecord(row)
    if (r.id) goalById.set(String(r.id), typeof r.goal === 'string' ? r.goal : '')
  }

  const stepsByRoadmap = new Map<string, unknown[]>()
  for (const row of stepsRes.data ?? []) {
    const r = asRecord(row)
    const id = String(r.roadmap_id ?? '')
    if (!id) continue
    const list = stepsByRoadmap.get(id) ?? []
    list.push({ title: r.title, milestone: r.milestone_title, status: r.status })
    stepsByRoadmap.set(id, list)
  }

  const seen = new Set<string>()
  const learnings: RoadmapGeneratePriorLearning[] = []
  for (const row of versionsRes.data ?? []) {
    const r = asRecord(row)
    const id = String(r.roadmap_id ?? '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    learnings.push({
      goal: goalById.get(id) ?? '',
      summary: r.summary ?? {},
      steps: stepsByRoadmap.get(id) ?? [],
    })
    if (learnings.length >= 3) break
  }
  return learnings
}