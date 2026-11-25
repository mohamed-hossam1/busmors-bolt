import { requireApiIdentity, apiError } from '@/server/auth'
import { buildBrainProposalPayload, type LearningForPromotion } from '@/server/roadmap/learning'

export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RouteContext = { params: Promise<{ id: string }> }

interface PromoteRequestBody {
  category?: unknown
  title?: unknown
  summary?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function errorStatus(error: unknown): number {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : ''
  if (message.includes('LEARNING_NOT_FOUND')) return 404
  if (message.includes('NOT_AUTHENTICATED')) return 401
  if (message.includes('INVALID_PROPOSAL') || message.includes('INVALID_ACTION')) return 400
  return 500
}

/**
 * POST /api/roadmap/learning-log/[id]/promote
 *
 * Promotes a durable business fact from a Roadmap learning-log entry to the
 * Business Brain by creating a PENDING proposal through the existing
 * propose_brain_change SECURITY DEFINER RPC. brain_nodes is NEVER mutated
 * directly here — the owner approves the proposal later through the existing
 * Brain approval flow. On success the learning entry is linked to the proposal
 * via mark_learning_promoted.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const { id } = await params
    if (!UUID_RE.test(id)) {
      return Response.json({ error: 'A valid learning id is required.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => ({}))) as PromoteRequestBody

    const learningRes = await supabase
      .from('roadmap_learning_log')
      .select('id,roadmap_id,hypothesis,experiment,learning,decision,promoted_proposal_id')
      .eq('id', id)
      .eq('workspace_id', user.id)
      .maybeSingle()
    if (learningRes.error) throw learningRes.error
    const entry = asRecord(learningRes.data)
    if (!entry.id) {
      return Response.json({ error: 'This learning entry could not be found.' }, { status: 404 })
    }
    if (entry.promoted_proposal_id) {
      return Response.json({ proposalId: entry.promoted_proposal_id, status: 'pending', duplicate: true })
    }

    const forPromotion: LearningForPromotion = {
      id: String(entry.id),
      roadmap_id: typeof entry.roadmap_id === 'string' ? entry.roadmap_id : null,
      hypothesis: typeof entry.hypothesis === 'string' ? entry.hypothesis : '',
      experiment: typeof entry.experiment === 'string' ? entry.experiment : '',
      learning: typeof entry.learning === 'string' ? entry.learning : '',
      decision: typeof entry.decision === 'string' ? entry.decision : '',
    }

    const payload = buildBrainProposalPayload(forPromotion, body)
    if (!payload.p_title || !payload.p_summary) {
      return Response.json({ error: 'A title and summary are required to propose a Brain fact.' }, { status: 400 })
    }

    const proposed = await supabase.rpc('propose_brain_change', payload)
    if (proposed.error) {
      return Response.json({ error: proposed.error.message || 'The Brain proposal could not be created.' }, { status: errorStatus(proposed.error) })
    }

    const proposal = asRecord(proposed.data)
    const proposalId = typeof proposal.proposalId === 'string' ? proposal.proposalId : ''
    if (!proposalId) {
      return Response.json({ error: 'The Brain proposal could not be created.' }, { status: 500 })
    }

    const marked = await supabase.rpc('mark_learning_promoted', {
      p_learning_id: id,
      p_proposal_id: proposalId,
    })
    if (marked.error) {
      return Response.json({ error: marked.error.message || 'The learning could not be linked to the proposal.' }, { status: errorStatus(marked.error) })
    }

    return Response.json({
      proposalId,
      status: 'pending',
      duplicate: proposal.duplicate === true,
      entry: asRecord(marked.data),
    })
  } catch (error) {
    return apiError(error)
  }
}