import { requireApiIdentity, apiError } from '@/server/auth'
import { generateRoadmapFromDiscovery, RoadmapGenerationError } from '@/server/roadmap/generator'
import { createClient } from '@supabase/supabase-js'
import { publicSupabaseConfig } from '@/lib/supabase-config'
import { getRequestLocale } from '@/server/locale'

export const maxDuration = 120

export async function POST(request: Request) {
 try {
  const { supabase, user } = await requireApiIdentity(request)
  const text = await request.text()
  if (text.length > 20000) return Response.json({ error: 'Request too large.' }, { status: 413 })
  const body = JSON.parse(text)
  const { data: session } = await supabase.auth.getSession()
  const token = session.session!.access_token

  if (body.action === 'load') {
   const { data, error } = await supabase.rpc('load_active_roadmap')
   if (error) throw error
   return Response.json(data ?? { roadmap: null }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  if (body.action === 'setStepStatus') {
   if (typeof body.stepId !== 'string' || typeof body.status !== 'string') {
    return Response.json({ error: 'Missing step or status.' }, { status: 400 })
   }
   const { data, error } = await supabase.rpc('set_roadmap_step_status', {
    p_step_id: body.stepId,
    p_status: body.status,
    p_attestation: body.attestation ?? {},
   })
   if (error) throw error
   return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  if (body.action === 'generate') {
   const { url, key } = publicSupabaseConfig()
   const db = createClient(
    process.env.SUPABASE_URL || url,
    key,
    { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false } },
   )
   const result = await generateRoadmapFromDiscovery({
    supabase: db,
    workspaceId: user.id,
    token,
    locale: await getRequestLocale(),
    signal: request.signal,
   })
   return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  return Response.json({ error: 'Unknown roadmap action.' }, { status: 400 })
 } catch (error) {
  if (error instanceof RoadmapGenerationError) {
   return Response.json({ error: error.message, code: error.code }, { status: error.code === 'STALE_VERSION' ? 409 : 422 })
  }
  return apiError(error)
 }
}

export async function GET(request: Request) {
 try {
  const { supabase } = await requireApiIdentity(request)
  const { data, error } = await supabase.rpc('load_active_roadmap')
  if (error) throw error
  return Response.json(data ?? { roadmap: null }, { headers: { 'Cache-Control': 'private, no-store' } })
 } catch (error) {
  return apiError(error)
 }
}