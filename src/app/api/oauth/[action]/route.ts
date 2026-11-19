import { connectOAuth } from '@/server/oauth-connect'
import { requireApiIdentity, apiError } from '@/server/auth'
export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
 try {
  const { action } = await params
  if (!['start', 'callback'].includes(action)) return new Response(null, { status: 404 })
  if (action === 'callback') return connectOAuth(request)
  const { supabase } = await requireApiIdentity(request)
  const { data } = await supabase.auth.getSession()
  return connectOAuth(new Request(request.url, { headers: { Authorization: 'Bearer ' + data.session!.access_token } }))
 } catch (error) { return apiError(error) }
}
