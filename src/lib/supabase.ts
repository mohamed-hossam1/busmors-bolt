import { createBrowserClient } from '@supabase/ssr'
import { publicSupabaseConfig } from './supabase-config'
const { url, key, cookieName } = publicSupabaseConfig()
export const supabase = createBrowserClient(url, key, { cookieOptions: { name: cookieName } })
