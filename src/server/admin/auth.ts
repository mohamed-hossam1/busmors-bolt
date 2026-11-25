import 'server-only'
import { redirect } from 'next/navigation'
import { getIdentity } from '../auth'
import { getRequestLocale } from '../locale'
import { localizePath } from '../../lib/i18n'
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

/** Returns the admin session, or null for pages (caller redirects). */
export async function getAdminIdentity(): Promise<AdminSession | null> {
  return getAdminSession()
}

/** Redirect helper for admin pages; call only from server components. */
export async function requireAdminPage(): Promise<AdminSession> {
  const session = await getAdminIdentity()
  if (!session) {
    const locale = await getRequestLocale()
    redirect(localizePath('/signin', locale))
  }
  return session
}