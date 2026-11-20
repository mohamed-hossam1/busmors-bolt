import { requireApiIdentity, apiError } from '@/server/auth'
export async function POST(request: Request) {
 try {
  const { supabase, user } = await requireApiIdentity(request)
  const { data, error } = await supabase.rpc('bootstrap_workspace')
  if (error || data?.workspace_id !== user.id) throw new Error('Workspace unavailable')
  // The browser cannot read server env. Report whether the managed model is
  // configured (AI_API_KEY + AI_PROVIDER + AI_MODEL) so Settings can tell the
  // user the workspace uses the managed model by default (BYOK is optional).
  const managedModel = Boolean(process.env.AI_API_KEY && process.env.AI_PROVIDER && process.env.AI_MODEL)
  return Response.json({ ...data, managedModel })
 } catch (error) { return apiError(error) }
}
