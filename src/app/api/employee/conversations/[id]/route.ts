import { requireApiIdentity, apiError } from '@/server/auth'
import {
  conversationExists,
  deleteConversation,
  loadMessages,
  type ConversationSupabase,
} from '@/server/employee/conversation-store'
import {
  hydrateMessageProposalStatuses,
  type ProposalStatusSupabase,
} from '@/server/employee/proposal-status'

/**
 * A single Employee conversation (Phase 3.5).
 *
 * GET    /api/employee/conversations/:id -> the conversation's messages (oldest
 *        first). Ownership is verified against the authenticated workspace.
 * DELETE /api/employee/conversations/:id -> delete the conversation (messages
 *        cascade). Scoped to the caller's workspace.
 */

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const { id } = await params
    const db = supabase as unknown as ConversationSupabase
    const exists = await conversationExists(db, id, user.id)
    if (!exists) {
      return Response.json({ error: 'This conversation could not be found.' }, { status: 404 })
    }
    const rawMessages = await loadMessages(db, id)
    const messages = await hydrateMessageProposalStatuses(
      supabase as unknown as ProposalStatusSupabase,
      user.id,
      rawMessages,
    )
    return Response.json({ messages })
  } catch (error) {
    return apiError(error)
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const { id } = await params
    await deleteConversation(supabase as unknown as ConversationSupabase, id, user.id)
    return Response.json({ ok: true })
  } catch (error) {
    return apiError(error)
  }
}