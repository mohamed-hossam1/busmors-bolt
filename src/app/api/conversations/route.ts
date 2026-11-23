import { requireApiIdentity, apiError } from '@/server/auth'
import { createClient } from '@supabase/supabase-js'
import { publicSupabaseConfig } from '@/lib/supabase-config'
import { callTitleModel, cleanChatTitle } from '@/server/chat-title'

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireApiIdentity(request)
    const text = await request.text()
    if (text.length > 20000) return Response.json({ error: 'Request too large.' }, { status: 413 })
    const body = JSON.parse(text)
    if (body.action !== 'title') return Response.json({ error: 'Unknown conversation action.' }, { status: 400 })
    if (typeof body.conversationId !== 'string' || !body.conversationId) return Response.json({ error: 'Missing conversation.' }, { status: 400 })
    if (typeof body.request !== 'string' || !body.request.trim() || body.request.length > 12000) return Response.json({ error: 'Enter a message of up to 12,000 characters.' }, { status: 400 })

    const { data: session } = await supabase.auth.getSession()
    const token = session.session!.access_token
    const { url, key } = publicSupabaseConfig()
    const db = createClient(process.env.SUPABASE_URL || url, key, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } })

    // Only retitle when this is still the first user message in the conversation.
    const { count, error: countError } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', body.conversationId)
      .eq('workspace_id', user.id)
      .eq('role', 'user')
    if (countError) return apiError(countError)
    if ((count ?? 0) > 1) {
      return Response.json({ error: 'Conversation already has a title.' }, { status: 409 })
    }

    const result = await callTitleModel({
      userPrompt: `First user message: "${body.request}"`,
      accessToken: token,
      signal: request.signal,
    })
    if (!result.ok) return Response.json({ error: result.error ?? 'provider_error' }, { status: 502 })

    const title = cleanChatTitle(result.text)
    if (!title) return Response.json({ error: 'Empty title.' }, { status: 502 })

    const { error } = await db
      .from('conversations')
      .update({ title })
      .eq('id', body.conversationId)
      .eq('workspace_id', user.id)
      .select('title')
      .single()
    if (error) return apiError(error)

    return Response.json({ title }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return apiError(error) }
}
