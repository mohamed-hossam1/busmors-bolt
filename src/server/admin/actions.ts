'use server'

import { getIdentity } from '../auth'
import { isAdminUser } from './auth'

export async function checkIsAdminUser(userInfo?: { id?: string; email?: string | null }): Promise<boolean> {
  if (userInfo?.id || userInfo?.email) {
    if (isAdminUser({ id: userInfo.id ?? '', email: userInfo.email })) {
      return true
    }
  }
  const identity = await getIdentity()
  return isAdminUser(identity?.user)
}
