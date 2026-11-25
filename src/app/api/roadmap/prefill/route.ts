import { requireApiIdentity, apiError } from '@/server/auth'
import { fixedQuestionsForGoal, goalDefinition, OTHER_OPTION_VALUE } from '@/features/roadmap/discovery'
import {
  runPrefill,
  isDeliverableStale,
  type PrefillBrainNode,
  type PrefillDeliverable,
  type PrefillPreviousAnswer,
  type PrefillQuestion,
} from '@/server/roadmap/prefill'

export const maxDuration = 60

interface PrefillRequestBody {
  goal?: unknown
  questionKeys?: unknown
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

/**
 * POST /api/roadmap/prefill
 *
 * Returns AI-suggested answers for the fixed Discovery questions of one
 * challenge, grounded in the workspace's approved Business Brain, recent
 * non-stale Deliverables, and previous roadmap answers. Suggestions are always
 * proposals; the client never applies them without owner confirmation.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => ({}))) as PrefillRequestBody
    const goal = typeof body.goal === 'string' ? body.goal : ''
    if (!goal) return Response.json({ error: 'A challenge goal is required.' }, { status: 400 })

    const locale = body.locale === 'ar' ? 'ar' : 'en'
    const goalLabel = goalDefinition(goal, locale)?.label ?? goal
    const requestedKeys = Array.isArray(body.questionKeys)
      ? body.questionKeys.filter((key): key is string => typeof key === 'string')
      : null

    const definitions = fixedQuestionsForGoal(goal)
      .filter((def) => !requestedKeys || requestedKeys.includes(def.key))
      .map<PrefillQuestion>((def) => ({
        key: def.key,
        label: def.label,
        options: def.options.map((option) => option.value),
        askDirectorEligible: def.askDirectorEligible,
      }))

    if (definitions.length === 0) {
      return Response.json({ suggestions: [] })
    }

    const [brainRes, deliverableRes, answerRes] = await Promise.all([
      supabase
        .from('brain_nodes')
        .select('id,title,summary,category,version,status,approval_state,is_current,verification_state')
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
        .from('discovery_questions')
        .select('question_key,status,value,provenance,updated_at')
        .eq('workspace_id', user.id)
        .in('status', ['answered', 'confirmed'])
        .order('updated_at', { ascending: false })
        .limit(50),
    ])

    if (brainRes.error) throw brainRes.error
    if (deliverableRes.error) throw deliverableRes.error
    if (answerRes.error) throw answerRes.error

    const brain: PrefillBrainNode[] = (brainRes.data ?? []).map((row) => {
      const r = asRecord(row)
      return {
        id: String(r.id ?? ''),
        title: typeof r.title === 'string' ? r.title : '',
        summary: typeof r.summary === 'string' ? r.summary : '',
        category: typeof r.category === 'string' ? r.category : '',
        version: typeof r.version === 'number' ? r.version : 1,
      }
    }).filter((node) => node.id && node.title)

    const deliverables: PrefillDeliverable[] = (deliverableRes.data ?? []).map((row) => {
      const r = asRecord(row)
      const content = typeof r.content === 'string' ? r.content : ''
      return {
        id: String(r.id ?? ''),
        title: typeof r.title === 'string' ? r.title : '',
        type: typeof r.type === 'string' ? r.type : 'general',
        version: typeof r.version === 'number' ? r.version : 1,
        summary: content.slice(0, 400),
        staleReason: typeof r.stale_reason === 'string' ? r.stale_reason : null,
        updatedAt: typeof r.updated_at === 'string' ? r.updated_at : '',
      }
    }).filter((deliverable) => deliverable.id && deliverable.title)

    const previousAnswers: PrefillPreviousAnswer[] = (answerRes.data ?? [])
      .map((row) => {
        const r = asRecord(row)
        return {
          questionKey: typeof r.question_key === 'string' ? r.question_key : '',
          answer: answerText(r.value),
          status: typeof r.status === 'string' ? r.status : 'answered',
        }
      })
      .filter((answer) => answer.questionKey && answer.answer)

    const result = await runPrefill({
      goal,
      goalLabel,
      questions: definitions,
      brain,
      deliverables,
      previousAnswers,
      locale,
    })

    const allowedKeys = new Set(definitions.map((question) => question.key))
    const staleDeliverableIds = new Set(
      deliverables.filter((deliverable) => isDeliverableStale(deliverable)).map((deliverable) => deliverable.id),
    )
    const suggestions = result.suggestions
      .filter(
        (suggestion) => allowedKeys.has(suggestion.questionKey) && suggestion.suggestedAnswer !== OTHER_OPTION_VALUE,
      )
      .map((suggestion) =>
        suggestion.sourceType === 'deliverable' && suggestion.sourceId && staleDeliverableIds.has(suggestion.sourceId)
          ? { ...suggestion, isStale: true }
          : suggestion,
      )
    return Response.json({ suggestions })
  } catch (error) {
    return apiError(error)
  }
}