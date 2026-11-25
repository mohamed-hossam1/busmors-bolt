/**
 * Admin authorization identity (pure, dependency-injected).
 *
 * Security rule (spec 13.5): admin identity is derived strictly from the
 * authenticated server session. The caller never supplies an id or email that
 * is trusted — `checkIsAdminUser` ignores any arguments and resolves the user
 * from the session resolver it is given. The only allow-list is operator
 * configuration on the server (`ADMIN_USER_ID` / `ADMIN_EMAIL`); a missing
 * configuration denies access (fail closed).
 *
 * This module has no Next.js imports so it can be unit-tested directly.
 */

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function adminUserIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return csv(env.ADMIN_USER_ID)
}

export function adminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return csv(env.ADMIN_EMAIL ?? env.ADMIN_EMAILS).map((email) => email.toLowerCase())
}

export interface AdminIdentityUser {
  id: string
  email?: string | null
}

export interface AdminSession {
  user: AdminIdentityUser
}

/** Pure check of a session-derived user against the server allow-list. */
export function isAdminUser(
  user: AdminIdentityUser | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!user || !user.id) return false
  if (adminUserIds(env).includes(user.id)) return true
  const email = user.email?.toLowerCase()
  return Boolean(email) && adminEmails(env).includes(email as string)
}

export type SessionResolver = () => Promise<AdminSession | null | undefined>

/**
 * Authoritative admin check. Identity comes ONLY from the authenticated session
 * resolved by `resolveSession`; any caller-supplied id/email is ignored. Returns
 * the session when the resolved user is an admin, otherwise null.
 */
export async function checkIsAdminUser(
  resolveSession: SessionResolver,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AdminSession | null> {
  let session: AdminSession | null | undefined
  try {
    session = await resolveSession()
  } catch {
    return null
  }
  if (!session || !isAdminUser(session.user, env)) return null
  return session
}