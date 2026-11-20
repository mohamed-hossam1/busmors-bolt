import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase credentials with elevated privileges.
 *
 * Prefers the current `SUPABASE_SECRET_KEY` (`sb_secret_...`) and falls back to
 * the legacy `SUPABASE_SERVICE_ROLE_KEY` JWT. Both bypass RLS, so this key must
 * never be exposed to the browser (never prefix it with NEXT_PUBLIC_).
 */
export function getServiceRoleKey(): string {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function hasServiceRoleKey(): boolean {
  return getServiceRoleKey().length > 0
}

/** Admin client for privileged server-only operations (credential RPCs, OAuth secrets). */
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = getServiceRoleKey()
  if (!url || !key) throw new Error('server_misconfigured')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}