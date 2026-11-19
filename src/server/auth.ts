import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from './supabase'
import type { WorkspaceSettings } from '../lib/types'
export const getIdentity = cache(async () => {
 const supabase = await createServerSupabase()
 const { data, error } = await supabase.auth.getUser()
 if (error || !data.user) return null
 return { supabase, user: data.user }
})
export const requireWorkspace = cache(async (setup = true) => {
 const identity = await getIdentity()
 if (!identity) redirect('/signin')
 const { data: settings, error } = await identity.supabase.rpc('bootstrap_workspace')
 if (error || settings?.workspace_id !== identity.user.id) throw new Error('Workspace could not be loaded.')
 if (setup && settings.onboarding_state !== 'complete') redirect('/onboarding')
 const { data } = await identity.supabase.auth.getSession()
 const session = data.session ?? ({ user: identity.user, access_token: '', refresh_token: '', expires_at: 0, expires_in: 0, token_type: 'bearer' } as unknown as import('@supabase/supabase-js').Session)
 return { session, settings: settings as WorkspaceSettings }
})
export async function requireApiIdentity(request: Request) {
 if (!['GET', 'HEAD'].includes(request.method)) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
  if (origin && new URL(origin).host !== host) throw new Response('Forbidden', { status: 403 })
 }
 const identity = await getIdentity()
 if (!identity) throw new Response('Unauthorized', { status: 401 })
 return identity
}
export function apiError(error: unknown) {
 if (error instanceof Response) return error
 return Response.json({ error: 'The request could not be completed. Please retry.' }, { status: 500 })
}
