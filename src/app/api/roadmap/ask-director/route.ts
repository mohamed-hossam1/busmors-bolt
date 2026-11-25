import { requireApiIdentity, apiError } from '@/server/auth'
import {
  answerLabel,
  goalDefinition,
  isAskDirectorEligible,
  localizeQuestionSchema,
  parseDiscoveryContext,
} from '@/features/roadmap/discovery'
import type { DiscoveryQuestion } from '@/features/roadmap/types'
import { isDeliverableStale } from '@/server/roadmap/prefill'
import {
  runRoadmapQuickAnswer,
  type RoadmapQuickAnswerBrainNode,
  type RoadmapQuickAnswerDeliverable,
  type RoadmapQuickAnswerOwnerAnswer,
} from '@/server/roadmap/ask-director'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AskDirectorRequestBody {
  draftId?: unknown
  questionId?: unknown
  locale?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function answerText(value: unknown): string {
  const record = asRecord(value)
  if (typeof record.text === 'string' && record.text.trim()) return record.text.trim()
  if (typeof record.choice === 'string' && record.choice.trim()) return record.choice.trim()
  return ''
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => ({}))) as AskDirectorRequestBody
    const draftId = typeof body.draftId === 'string' ? body.draftId : ''
    const questionId = typeof body.questionId === 'string' ? body.questionId : ''
    const locale = body.locale === 'ar' ? 'ar' : 'en'
    if (!UUID_RE.test(draftId) || !UUID_RE.test(questionId)) {
      return Response.json({ error: 'A valid draft and question are required.' }, { status: 400 })
    }

    const [questionRes, draftRes] = await Promise.all([
      supabase
        .from('discovery_questions')
        .select('*')
        .eq('id', questionId)
        .eq('workspace_id', user.id)
        .single(),
      supabase
        .from('discovery_drafts')
        .select('*')
        .eq('id', draftId)
        .eq('workspace_id', user.id)
        .single(),
    ])

    if (questionRes.error || !questionRes.data) {
      return Response.json({ error: 'The Discovery question could not be found.' }, { status: 404 })
    }
    if (draftRes.error || !draftRes.data) {
      return Response.json({ error: 'The Discovery draft could not be found.' }, { status: 404 })
    }

    const question = questionRes.data as DiscoveryQuestion
    const draft = asRecord(draftRes.data)
    if (question.draft_id !== draftId || draft.id !== draftId) {
      return Response.json({ error: 'The question does not belong to this Discovery draft.' }, { status: 400 })
    }
    if (!isAskDirectorEligible(question)) {
      return Response.json({ error: 'This question is not eligible for a Marketing Director suggestion.' }, { status: 400 })
    }

    const schema = localizeQuestionSchema(question.question_key, question.schema, locale)
    const context = parseDiscoveryContext(Array.isArray(draft.context_refs) ? draft.context_refs : [])
    const goal = typeof draft.goal === 'string' ? draft.goal : 'something_else'
    const goalLabel = goalDefinition(goal, locale)?.label ?? goal
    const secondaryChallenges = context.secondaryGoals
      .map((value) => goalDefinition(value, locale)?.label ?? value)
      .filter(Boolean)

    const [brainRes, deliverableRes, answerRes] = await Promise.all([
      supabase
        .from('brain_nodes')
        .select('id,title,summary,category,version')
        .eq('workspace_id', user.id)
        .eq('status', 'approved')
        .eq('is_current', true)
        .order('updated_at', { ascending: false })
        .limit(40),
      supabase
        .from('deliverables')
        .select('id,title,type,version,content,stale_reason,updated_at')
        .eq('workspace_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(10),
      supabase
        .from('discovery_questions')
        .select('question_key,status,value,updated_at')
        .eq('workspace_id', user.id)
        .in('status', ['answered', 'confirmed'])
        .order('updated_at', { ascending: false })
        .limit(50),
    ])

    if (brainRes.error) throw brainRes.error
    if (deliverableRes.error) throw deliverableRes.error
    if (answerRes.error) throw answerRes.error

    const brain: RoadmapQuickAnswerBrainNode[] = (brainRes.data ?? []).map((row) => {
      const record = asRecord(row)
      return {
        id: String(record.id ?? ''),
        title: typeof record.title === 'string' ? record.title : '',
        summary: typeof record.summary === 'string' ? record.summary : '',
        category: typeof record.category === 'string' ? record.category : '',
        version: typeof record.version === 'number' ? record.version : 1,
      }
    }).filter((node) => node.id && node.title)

    const deliverables: RoadmapQuickAnswerDeliverable[] = (deliverableRes.data ?? []).map((row) => {
      const record = asRecord(row)
      const content = typeof record.content === 'string' ? record.content : ''
      const updatedAt = typeof record.updated_at === 'string' ? record.updated_at : ''
      const staleReason = typeof record.stale_reason === 'string' ? record.stale_reason : null
      return {
        id: String(record.id ?? ''),
        title: typeof record.title === 'string' ? record.title : '',
        type: typeof record.type === 'string' ? record.type : 'general',
        version: typeof record.version === 'number' ? record.version : 1,
        summary: content.slice(0, 400),
        stale: isDeliverableStale({ staleReason, updatedAt }),
        updatedAt,
      }
    }).filter((deliverable) => deliverable.id && deliverable.title)

    const ownerAnswers: RoadmapQuickAnswerOwnerAnswer[] = (answerRes.data ?? [])
      .map((row) => {
        const record = asRecord(row)
        return {
          questionKey: typeof record.question_key === 'string' ? record.question_key : '',
          answer: answerText(record.value),
          status: typeof record.status === 'string' ? record.status : 'answered',
        }
      })
      .filter((answer) => answer.questionKey && answer.answer)

    const result = await runRoadmapQuickAnswer({
      workspaceId: user.id,
      locale,
      challenge: { key: goal, label: goalLabel },
      secondaryChallenges,
      somethingElseNote: context.somethingElseNote,
      question: {
        id: question.id,
        key: question.question_key,
        label: schema.label,
        options: (schema.options ?? [])
          .filter((option) => option.value !== '__other__')
          .map((option) => ({ value: option.value, label: option.label })),
        currentAnswer: answerLabel(question.value, schema),
        status: question.status,
      },
      brain,
      deliverables,
      ownerAnswers,
    })

    if (!result.proposal) {
      return Response.json(
        { error: result.error ?? 'The Marketing Director could not answer right now.' },
        { status: 502 },
      )
    }

    const proposal = {
      ...result.proposal,
      mode: 'roadmap_quick_answer' as const,
      askedAt: new Date().toISOString(),
    }
    const saved = await supabase.rpc('save_director_question_proposal', {
      p_question_id: question.id,
      p_proposal: proposal,
    })
    if (saved.error) {
      return Response.json(
        { error: 'The Marketing Director suggestion could not be saved. Please retry.' },
        { status: 500 },
      )
    }

    return Response.json({ mode: 'roadmap_quick_answer', proposal })
  } catch (error) {
    return apiError(error)
  }
}