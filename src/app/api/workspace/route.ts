import { requireApiIdentity, apiError } from '@/server/auth'
export async function POST(request: Request) {
 try {
  const { supabase, user } = await requireApiIdentity(request)
  const { data, error } = await supabase.rpc('bootstrap_workspace')
  if (error || data?.workspace_id !== user.id) throw new Error('Workspace unavailable')
  return Response.json(data)
 } catch (error) { return apiError(error) }
}
