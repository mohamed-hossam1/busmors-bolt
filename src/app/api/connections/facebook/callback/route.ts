import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getIdentity } from '@/server/auth'
import { getPublishingProvider } from '@/server/publishing/provider'
import { saveFacebookConnection } from '@/server/publishing/save-connection'
import { CONNECT_COOKIE, PENDING_COOKIE, clearFlowCookie, setFlowCookie } from '@/server/publishing/connection-http'

function sameNonce(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

/** The provider sends the browser back here after Facebook consent. Never publishes anything. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const toSettings = (result: string) => NextResponse.redirect(new URL('/settings?facebook=' + result, url.origin))
  const identity = await getIdentity()
  if (!identity) return NextResponse.redirect(new URL('/signin', url.origin))

  const cookieStore = await cookies()
  const expected = cookieStore.get(CONNECT_COOKIE)?.value ?? ''
  const nonce = url.searchParams.get('nonce') ?? ''
  // The nonce is single use: clear it whatever happens next.
  const fail = () => { const response = toSettings('failed'); clearFlowCookie(response, CONNECT_COOKIE); return response }
  if (!sameNonce(nonce, expected)) return fail()

  const provider = getPublishingProvider()
  if (!provider) return fail()
  const userId = identity.user.id
  try {
    const completed = await provider.completeConnection(userId, url.searchParams)
    if (!completed.ok) return fail()
    const pages = await provider.listPages(userId, completed.connectionRef)
    if (pages.length === 0) {
      const response = toSettings('no_pages')
      clearFlowCookie(response, CONNECT_COOKIE)
      return response
    }
    if (pages.length === 1) {
      if (!(await saveFacebookConnection(provider, userId, completed.connectionRef, pages[0]))) return fail()
      const response = toSettings('connected')
      clearFlowCookie(response, CONNECT_COOKIE)
      return response
    }
    const response = toSettings('choose_page')
    clearFlowCookie(response, CONNECT_COOKIE)
    setFlowCookie(response, PENDING_COOKIE, completed.connectionRef)
    return response
  } catch {
    return fail()
  }
}
