import 'server-only'
import { redirect } from 'next/navigation'
import { getIdentity } from '../auth'
import { getRequestLocale } from '../locale'
import { localizePath } from '../../lib/i18n'

/**
 * Admin authorization.
 *
 * The admin surface is not a customer workspace feature; it is gated by an
 * explicit operator identity configured on the server (`ADMIN_USER_ID` and/or
 * `ADMIN_EMAIL`). A missing configuration denies access (fail closed), so the
 * dashboard is never accidentally public.
 */

function csv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
}

export function adminUserIds(): string[] {
  return csv(process.env.ADMIN_USER_ID)
}

export function adminEmails(): string[] {
  return csv(process.env.ADMIN_EMAIL ?? process.env.ADMIN_EMAILS).map((email) => email.toLowerCase())
}

export interface AdminIdentityUser {
  id: string
  email?: string | null
}

export function isAdminUser(user: AdminIdentityUser | null | undefined): boolean {
  if (!user) return false
  if (adminUserIds().includes(user.id)) return true
  const email = user.email?.toLowerCase()
  return Boolean(email) && adminEmails().includes(email as string)
}

/** Throws a 401/403 Response for API routes. */
export async function requireAdminIdentity() {
  const identity = await getIdentity()
  if (!identity) throw new Response('Unauthorized', { status: 401 })
  if (!isAdminUser(identity.user)) throw new Response('Forbidden', { status: 403 })
  return identity
}

/** Returns the admin identity, or null for pages (caller redirects). */
export async function getAdminIdentity() {
  const identity = await getIdentity()
  if (!identity || !isAdminUser(identity.user)) return null
  return identity
}

/** Redirect helper for admin pages; call only from server components. */
export async function requireAdminPage(): Promise<NonNullable<Awaited<ReturnType<typeof getAdminIdentity>>>> {
  const identity = await getAdminIdentity()
  if (!identity) {
    const locale = await getRequestLocale()
    redirect(localizePath('/signin', locale))
  }
  return identity
}