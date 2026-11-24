import { requireApiIdentity, apiError } from '@/server/auth'
import { createAdminClient } from '@/server/supabase-admin'
import { loadCanvasEvents } from '@/server/employee/canvas-events'

export const dynamic = 'force-dynamic'

/**
 * Customer Agent Canvas feed (spec §10, §13.5).
 *
 * Returns ONLY the safe Canvas projection (agent hierarchy + distinct skill/tool
 * names) for the latest execution trace of a conversation the caller owns.
 * Ownership is verified with the caller's RLS-scoped client before the service
 * role reads the trace; privileged payloads/prompts are never selected or
 * returned. The customer Canvas never reads admin payloads directly.
 */
export async function GET(request: Request) {
 try {
  const { supabase, user } = await requireApiIdentity(request)
  const conversationId = new URL(request.url).searchParams.get('conversationId')
  if (!conversationId) return Response.json({ error: 'Missing conversation.' }, { status: 400 })

  // Ownership check through RLS: only the caller's own conversation resolves.
  const { data: owned } = await supabase.from('conversations').select('id').eq('id', conversationId).maybeSingle()
  if (!owned) return Response.json({ error: 'Not found.' }, { status: 404 })

  const admin = createAdminClient()
  const { data: traceRow } = await admin
    .from('admin_trace_list')
    .select('id')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (!traceRow) return Response.json({ events: [] }, { headers: { 'Cache-Control': 'private, no-store' } })

  const events = await loadCanvasEvents(admin, String((traceRow as { id: string }).id))
  // Only the owning workspace's events are ever returned (defense in depth).
  void user
  return Response.json({ events }, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (error) {
  return apiError(error)
 }
}