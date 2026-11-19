'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { WorkspaceSettings } from '../lib/types'
import { errorMessage } from '../lib/contracts'

interface AuthState {
  session: Session | null; settings: WorkspaceSettings | null; loading: boolean
  error: string | null; recovery: boolean; refreshSettings: () => Promise<void>
}
const AuthContext = createContext<AuthState>({ session: null, settings: null, loading: true, error: null, recovery: false, refreshSettings: async () => {} })

export function AuthProvider({ children, initial }: { children: ReactNode; initial?: { session: Session | null; settings: WorkspaceSettings | null } }) {
  const [session, setSession] = useState<Session | null>(initial?.session ?? null)
  const [settings, setSettings] = useState<WorkspaceSettings | null>(initial?.settings ?? null)
  const [loading, setLoading] = useState(!initial)
  const [error, setError] = useState<string | null>(null)
  const [recovery, setRecovery] = useState(false)
  const identity = useRef<string | null>(initial?.session?.user.id ?? initial?.settings?.workspace_id ?? null)
  const generation = useRef(0)
  const settingsReady = useRef(!!initial?.settings)
  const refreshSettings = useCallback(async () => {
    const userId = identity.current
    if (!userId) return
    const run = ++generation.current
    if (!settingsReady.current) setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/workspace', { method: 'POST' })
      if (!response.ok) throw new Error('Workspace could not be loaded.')
      const data = await response.json()
      if (!data?.workspace_id || data.workspace_id !== userId) throw new Error('Workspace setup returned an invalid response.')
      if (run === generation.current) { settingsReady.current=true;setSettings(data as WorkspaceSettings) }
    } catch (error) { if (run === generation.current) setError(errorMessage(error)) }
    finally { if (run === generation.current) setLoading(false) }
  }, [])

  useEffect(() => {
    let alive = true
    const accept = (next: Session | null) => {
      if (!alive) return
      setSession(next)
      const nextId = next?.user.id ?? null
      if (identity.current !== nextId || (nextId && !settingsReady.current)) {
        identity.current = nextId
        ++generation.current
        setSettings(null)
        settingsReady.current=false
        setError(null)
        if (nextId) {
          setLoading(true)
          // Never await another Supabase call inside the auth lock callback.
          setTimeout(() => { if (alive && identity.current === nextId) void refreshSettings() }, 0)
        } else setLoading(false)
      } else if (!nextId) setLoading(false)
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      accept(next)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) { setError(error.message); setLoading(false) }
      else accept(data.session)
    }).catch(error => { if (alive) { setError(errorMessage(error)); setLoading(false) } })
    return () => { alive = false; subscription.unsubscribe(); ++generation.current }
  }, [refreshSettings])

  return <AuthContext.Provider value={{ session, settings, loading, error, recovery, refreshSettings }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) }
