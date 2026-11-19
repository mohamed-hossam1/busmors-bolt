import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicSupabaseConfig } from './lib/supabase-config'
export async function proxy(request: NextRequest) {
 let response = NextResponse.next({ request })
 const { url, key, cookieName } = publicSupabaseConfig()
 const supabase = createServerClient(process.env.SUPABASE_URL || url, key, {
  cookieOptions: { name: cookieName },
  cookies: {
   getAll: () => request.cookies.getAll(),
   setAll: values => {
    values.forEach(({ name, value }) => request.cookies.set(name, value))
    response = NextResponse.next({ request })
    values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
   },
  },
 })
 const { data: { user } } = await supabase.auth.getUser()
 if (!user && /^\/(employee|brain|roadmap|scheduling|deliverables|settings|onboarding)(\/|$)/.test(request.nextUrl.pathname)) {
  const target = request.nextUrl.clone()
  target.pathname = '/signin'
  target.search = ''
  target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  const redirect = NextResponse.redirect(target)
  response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
  return redirect
 }
 response.headers.set('Cache-Control', 'private, no-store')
 return response
}
export const config = { matcher: ['/employee/:path*', '/brain/:path*', '/roadmap/:path*', '/scheduling/:path*', '/deliverables/:path*', '/settings/:path*', '/onboarding/:path*', '/auth/:path*', '/api/:path*'] }
