import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getIdentity } from '@/server/auth'
import { getMetaAdsProvider } from '@/server/meta-ads/provider'
import { loadConnection, saveConnection, selectAccount, disconnectConnection } from '@/server/meta-ads/store'
import { META_CONNECT_COOKIE, clearFlowCookie } from '@/server/meta-ads/connection-http'
import { chooseAccountOutcome, adsRedirectPath } from '@/features/meta-ads/account-choice'
import { LOCALE_COOKIE } from '@/lib/i18n'

function sameNonce(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

/** The provider sends the browser back here after Meta consent. Never publishes anything. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const cookieStore = await cookies()
  const toAds = (result: string) => NextResponse.redirect(new URL(adsRedirectPath(cookieStore.get(LOCALE_COOKIE)?.value, result), url.origin))
  const identity = await getIdentity()
  if (!identity) return NextResponse.redirect(new URL('/signin', url.origin))

  const expected = cookieStore.get(META_CONNECT_COOKIE)?.value ?? ''
  const nonce = url.searchParams.get('nonce') ?? ''
  // The nonce is single use: clear it whatever happens next.
  const fail = () => { const response = toAds('failed'); clearFlowCookie(response, META_CONNECT_COOKIE); return response }
  if (!sameNonce(nonce, expected)) return fail()

  const provider = getMetaAdsProvider()
  if (!provider) return fail()
  const userId = identity.user.id
  try {
    const completed = await provider.completeConnection(userId, url.searchParams)
    if (!completed.ok) return fail()
    const ref = completed.connectionRef

    const previous = await loadConnection(userId)
    if (!(await saveConnection(userId, ref))) return fail()
    if (previous?.connectionRef && previous.connectionRef !== ref) {
      // Best effort: the new connection is already saved and the old one is no longer used.
      try {
        await provider.disconnect(userId, previous.connectionRef)
      } catch {
        // ignored
      }
    }

    const listed = await provider.listAdAccounts(userId, ref)
    if (!listed.ok) return fail()

    const outcome = chooseAccountOutcome(listed.value)
    if (outcome.kind === 'none') {
      try {
        await provider.disconnect(userId, ref)
      } catch {
        // ignored
      }
      await disconnectConnection(userId)
      const response = toAds('no_accounts')
      clearFlowCookie(response, META_CONNECT_COOKIE)
      return response
    }
    if (outcome.kind === 'auto') {
      if (!(await selectAccount(userId, outcome.account))) return fail()
      const response = toAds('connected')
      clearFlowCookie(response, META_CONNECT_COOKIE)
      return response
    }
    const response = toAds('choose_account')
    clearFlowCookie(response, META_CONNECT_COOKIE)
    return response
  } catch {
    return fail()
  }
}