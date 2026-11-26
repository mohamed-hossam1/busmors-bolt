import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicSupabaseConfig } from './lib/supabase-config'
import { defaultLocale, hasLocale, LOCALE_COOKIE, type Locale } from './lib/i18n'
import { shouldRedirectOAuthCode } from './lib/authRouting'

const PROTECTED = /^\/(employee|brain|roadmap|scheduling|deliverables|settings|onboarding|ads)(\/|$)/
const AUTH_ROUTES = /^\/(signin|signup|reset)(\/|$)/

function detectLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value
  if (cookie && hasLocale(cookie)) return cookie
  return defaultLocale
}

function withoutLocale(pathname: string): string {
  const stripped = pathname.replace(/^\/[^/]+/, '')
  return stripped === '' ? '/' : stripped
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const segment = pathname.split('/')[1] ?? ''

  // 0. An OAuth/PKCE code that lands on any page other than the callback (e.g.
  // Supabase fell back to the site URL, which the locale step below turns into
  // "/ar?code=...") must be routed through the server callback so the code is
  // exchanged and the user is sent to onboarding/employee. Otherwise the code is
  // never consumed and the user is stranded on a marketing page.
  if (shouldRedirectOAuthCode(pathname, request.nextUrl.searchParams.has('code'))) {
    const target = request.nextUrl.clone()
    target.pathname = '/auth/callback'
    target.search = search
    return NextResponse.redirect(target)
  }

  // 1. Ensure the URL carries a locale prefix (/ar/..., /en/...).
  if (!hasLocale(segment)) {
    const locale = detectLocale(request)
    const target = request.nextUrl.clone()
    target.pathname = `/${locale}${pathname === '/' ? '' : pathname}`
    const redirect = NextResponse.redirect(target)
    redirect.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 31536000, sameSite: 'lax' })
    redirect.cookies.delete('NEXT_LOCALE')
    return redirect
  }

  const locale = segment as Locale
  let response = NextResponse.next({ request })
  const { url, key, cookieName } = publicSupabaseConfig()
  const supabase = createServerClient(process.env.SUPABASE_URL || url, key, {
    cookieOptions: { name: cookieName },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && PROTECTED.test(withoutLocale(pathname))) {
    const target = request.nextUrl.clone()
    target.pathname = `/${locale}/signin`
    target.search = ''
    target.searchParams.set('next', pathname + search)
    const redirect = NextResponse.redirect(target)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    redirect.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 31536000, sameSite: 'lax' })
    return redirect
  }
  if (user && AUTH_ROUTES.test(withoutLocale(pathname)) && request.nextUrl.searchParams.get('error') !== 'invite_required') {
    const target = request.nextUrl.clone()
    target.pathname = `/${locale}/employee`
    target.search = ''
    const redirect = NextResponse.redirect(target)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    redirect.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 31536000, sameSite: 'lax' })
    return redirect
  }
  response.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: 31536000, sameSite: 'lax' })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: ['/((?!api(?:/|$)|auth(?:/|$)|_next(?:/|$)|favicon.ico$|.*\\.).*)'],
}