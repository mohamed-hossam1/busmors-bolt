'use client'

import { useEffect } from 'react'
import { useLocaleRouter } from '../context/I18nContext'
import { useAuth } from '../context/AuthContext'

/**
 * Redirects an already-authenticated visitor to `target` (locale-aware) and
 * reports the session state so the screen can render nothing while signed in.
 */
export function useRedirectIfAuthenticated(target: string): boolean {
  const { session } = useAuth()
  const router = useLocaleRouter()
  useEffect(() => {
    if (session) router.replace(target)
  }, [session, target, router])
  return Boolean(session)
}