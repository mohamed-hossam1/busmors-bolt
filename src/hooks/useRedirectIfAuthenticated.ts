'use client'

import { useEffect } from 'react'
import { useLocaleRouter } from '../context/I18nContext'
import { useAuth } from '../context/AuthContext'
import { checkIsAdminUser } from '../server/admin/actions'

/**
 * Redirects an already-authenticated visitor to `target` (or `/admin` for admin users) (locale-aware) and
 * reports the session state so the screen can render nothing while signed in.
 */
export function useRedirectIfAuthenticated(target: string): boolean {
  const { session } = useAuth()
  const router = useLocaleRouter()
  useEffect(() => {
    if (!session) return
    let active = true
    void (async () => {
      const isAdmin = await checkIsAdminUser({ id: session.user.id, email: session.user.email })
      if (!active) return
      router.replace(isAdmin ? '/admin' : target)
    })()
    return () => {
      active = false
    }
  }, [session, target, router])
  return Boolean(session)
}