'use server'

import { getIdentity } from '../auth'
import { isAdminUser } from './auth'

/**
 * Authoritative server-side admin check. Identity is derived from the
 * authenticated Supabase session, never from a caller-supplied id/email
 * (audit §6.2 Medium). The optional argument is ignored for authorization and
 * kept only for call-site compatibility.
 */
export async function checkIsAdminUser(_userInfo?: { id?: string; email?: string | null }): Promise<boolean> {
  const identity = await getIdentity()
  return isAdminUser(identity?.user)
}