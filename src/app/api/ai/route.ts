import { generateAi } from '@/server/ai-generate'
import { requireApiIdentity, apiError } from '@/server/auth'
export const maxDuration = 60
export async function POST(request: Request) {
 try {
  const { supabase } = await requireApiIdentity(request)
  const { data } = await supabase.auth.getSession()
  const body = await request.text()
  if (body.length > 60000) return Response.json({ error: 'request_too_large' }, { status: 413 })
  return generateAi(new Request(request.url, { method: 'POST', headers: { Authorization: 'Bearer ' + data.session!.access_token, 'Content-Type': 'application/json' }, body }))
 } catch (error) { return apiError(error) }
}
