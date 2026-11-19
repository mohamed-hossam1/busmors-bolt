import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/server/supabase'
import { safeReturnPath } from '@/lib/authRouting'
export async function GET(request: Request) {
 const url = new URL(request.url)
 const supabase = await createServerSupabase()
 const code = url.searchParams.get('code')
 if (url.searchParams.has('error')) return NextResponse.redirect(new URL('/signin?error=callback', url))
 if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(new URL('/signin?error=callback', url))
 }
 const { data: { user } } = await supabase.auth.getUser()
 if (!user) return NextResponse.redirect(new URL('/signin?error=callback', url))
 if (url.searchParams.get('flow') === 'recovery') return NextResponse.redirect(new URL('/auth/new-password', url))
 const { data, error } = await supabase.rpc('bootstrap_workspace')
 if (error) return NextResponse.redirect(new URL('/signin?error=workspace', url))
 return NextResponse.redirect(new URL(data?.onboarding_state === 'complete' ? safeReturnPath(url.searchParams.get('next')) ?? '/employee' : '/onboarding', url))
}
