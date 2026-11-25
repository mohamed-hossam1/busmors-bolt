import { requireApiIdentity, apiError } from '@/server/auth'
import {
  createConversation,
  listConversations,
  DEFAULT_CONVERSATION_TITLE,
  type ConversationSupabase,
} from '@/server/employee/conversation-store'

/**
 * Employee chat-history collection (Phase 3.5).
 *
 * GET  /api/employee/conversations  -> list the caller's recent conversations.
 * POST /api/employee/conversations  -> start a new (empty) conversation.
 *
 * Workspace scoping is derived from the authenticated session; the client never
 * supplies a workspace id.
 */

export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const conversations = await listConversations(supabase as unknown as ConversationSupabase, user.id)
    return Response.json({ conversations })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const requestedTitle =
      body && typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 150)
        : DEFAULT_CONVERSATION_TITLE
    const conversation = await createConversation(supabase as unknown as ConversationSupabase, {
      id: crypto.randomUUID(),
      workspace_id: user.id,
      user_id: user.id,
      title: requestedTitle,
    })
    return Response.json({ conversation }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}