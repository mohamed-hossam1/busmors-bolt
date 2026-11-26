import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabase } from './supabase'
import { getRequestLocale } from './locale'
import { localizePath } from '../lib/i18n'
import { isBetaInviteOnly } from '../lib/authFlags'
import { isAdminUser } from './admin/admin-identity'
import { createAdminClient } from './supabase-admin'
import type { WorkspaceSettings } from '../lib/types'
export async function hasActivatedWorkspaceAccess(userId: string, email?: string | null): Promise<boolean> {
 if (!isBetaInviteOnly()) return true
 if (isAdminUser({ id: userId, email: email ?? null })) return true
 const admin = createAdminClient()
 const { data } = await admin.from('workspace_access').select('workspace_id').eq('workspace_id', userId).maybeSingle()
 return Boolean(data?.workspace_id)
}
export const getIdentity = cache(async () => {
 const supabase = await createServerSupabase()
 const { data, error } = await supabase.auth.getUser()
 if (error || !data.user) return null
 return { supabase, user: data.user }
})
export const requireWorkspace = cache(async (setup = true) => {
 const identity = await getIdentity()
 if (!identity) redirect(localizePath('/signin', await getRequestLocale()))
  if (!(await hasActivatedWorkspaceAccess(identity.user.id, identity.user.email))) redirect('/auth/invite-required')
 const { data: settings, error } = await identity.supabase.rpc('bootstrap_workspace')
 if (error || settings?.workspace_id !== identity.user.id) throw new Error('Workspace could not be loaded.')
 if (setup && settings.onboarding_state !== 'complete') {
  if (settings.crawl_status?.finished || settings.company_url) {
   await identity.supabase.rpc('set_onboarding_state', { p_state: 'complete' })
  } else {
   const { count } = await identity.supabase.from('brain_nodes').select('id', { count: 'exact', head: true }).eq('workspace_id', identity.user.id)
   if (count && count > 0) {
    await identity.supabase.rpc('set_onboarding_state', { p_state: 'complete' })
   } else {
    redirect(localizePath('/onboarding', await getRequestLocale()))
   }
  }
 }
  const { data: heavyTasks } = await identity.supabase.rpc('get_heavy_task_quota')
  const { data } = await identity.supabase.auth.getSession()
  const session = data.session ?? ({ user: identity.user, access_token: '', refresh_token: '', expires_at: 0, expires_in: 0, token_type: 'bearer' } as unknown as import('@supabase/supabase-js').Session)
  const workspaceSettings = settings as WorkspaceSettings
  return {
    session,
    settings: { ...workspaceSettings, heavyTasks: (heavyTasks as WorkspaceSettings['heavyTasks']) ?? null },
  }
})
export async function requireApiIdentity(request: Request) {
 if (!['GET', 'HEAD'].includes(request.method)) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host
  if (origin && new URL(origin).host !== host) throw new Response('Forbidden', { status: 403 })
 }
 const identity = await getIdentity()
 if (!identity) throw new Response('Unauthorized', { status: 401 })
 if (!(await hasActivatedWorkspaceAccess(identity.user.id, identity.user.email))) throw Response.json({ error: 'Beta invite required.', code: 'INVITE_REQUIRED' }, { status: 403 })
 return identity
}
export function apiError(error: unknown) {
 if (error instanceof Response) return error
 console.error('[apiError]', error)
 return Response.json({ error: 'The request could not be completed. Please retry.' }, { status: 500 })
}
