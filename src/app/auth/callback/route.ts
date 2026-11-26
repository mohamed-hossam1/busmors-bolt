import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/server/supabase'
import { safeReturnPath } from '@/lib/authRouting'
import { localizePath } from '@/lib/i18n'
import { getRequestLocale } from '@/server/locale'
import { createAdminClient } from '@/server/supabase-admin'
import { isBetaInviteOnly, isGoogleAuthEnabled } from '@/lib/authFlags'
import { hasActivatedWorkspaceAccess } from '@/server/auth'
export async function GET(request: Request) {
 const url = new URL(request.url)
 const supabase = await createServerSupabase()
 const locale = await getRequestLocale()
 const localized = (path: string) => localizePath(path, locale)
 const code = url.searchParams.get('code')
 if (url.searchParams.has('error')) return NextResponse.redirect(new URL(localized('/signin') + '?error=callback', url))
 if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL(localized('/signin') + '?error=callback', url))
 }
 const { data: { user } } = await supabase.auth.getUser()
 if (!user) return NextResponse.redirect(new URL(localized('/signin') + '?error=callback', url))
 if (isBetaInviteOnly() || !isGoogleAuthEnabled()) {
  if (!(await hasActivatedWorkspaceAccess(user.id, user.email))) {
   await supabase.auth.signOut()
   const admin = createAdminClient()
   const { data: existing } = await admin.from('workspaces').select('id').eq('id', user.id).maybeSingle()
   if (!existing) { await admin.auth.admin.deleteUser(user.id) }
   return NextResponse.redirect(new URL(localized('/signin') + '?error=invite_required', url))
  }
 }
 if (url.searchParams.get('flow') === 'recovery') return NextResponse.redirect(new URL(localized('/auth/new-password'), url))
 const { data, error } = await supabase.rpc('bootstrap_workspace')
 if (error) return NextResponse.redirect(new URL(localized('/signin') + '?error=workspace', url))
 return NextResponse.redirect(new URL(data?.onboarding_state === 'complete' ? safeReturnPath(url.searchParams.get('next')) ?? localized('/employee') : localized('/onboarding'), url))
}