import 'server-only'
import { redirect } from 'next/navigation'
import { getIdentity } from '../auth'
import { getRequestLocale } from '../locale'
import { localizePath } from '../../lib/i18n'
import { isSameOriginRequest } from '../../lib/authRouting'
import { checkIsAdminUser, type AdminSession } from './admin-identity'

/**
 * Admin authorization (Next.js bindings).
 *
 * The admin surface is not a customer workspace feature; it is gated by an
 * explicit operator identity configured on the server (`ADMIN_USER_ID` and/or
 * `ADMIN_EMAIL`). Identity is always derived from the authenticated server
 * session via getIdentity(); caller-supplied ids/emails are never trusted.
 */

export { adminUserIds, adminEmails, isAdminUser } from './admin-identity'
export type { AdminIdentityUser } from './admin-identity'

/** Resolve the current admin session from the authenticated server session. */
export async function getAdminSession(): Promise<AdminSession | null> {
  return checkIsAdminUser(async () => {
    const identity = await getIdentity()
    if (!identity) return null
    return { user: { id: identity.user.id, email: identity.user.email ?? null } }
  })
}

/** Throws a 401/403 Response for API routes. */
export async function requireAdminIdentity(): Promise<AdminSession> {
  const session = await getAdminSession()
  if (!session) {
    const identity = await getIdentity()
    if (!identity) throw new Response('Unauthorized', { status: 401 })
    throw new Response('Forbidden', { status: 403 })
  }
  return session
}

/** Throws a 403 Response for cross-origin mutations, then resolves the admin session. */
export async function requireAdminMutation(request: Request): Promise<AdminSession> {
  if (!isSameOriginRequest(request)) throw new Response('Forbidden', { status: 403 })
  return requireAdminIdentity()
}

/** Returns the admin session, or null for pages (caller redirects). */
export async function getAdminIdentity(): Promise<AdminSession | null> {
  return getAdminSession()
}

/** Redirect helper for admin pages; call only from server components. */
export async function requireAdminPage(nextPath?: string): Promise<AdminSession> {
  const session = await getAdminIdentity()
  if (!session) {
    const locale = await getRequestLocale()
    const target = nextPath ? '/signin?next=' + encodeURIComponent(nextPath) : '/signin'
    redirect(localizePath(target, locale))
  }
  return session
}