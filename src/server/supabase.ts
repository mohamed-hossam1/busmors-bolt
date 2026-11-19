import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicSupabaseConfig } from '../lib/supabase-config'

export async function createServerSupabase() {
  const store = await cookies()
  const { url, key, cookieName } = publicSupabaseConfig()
  return createServerClient(process.env.SUPABASE_URL || url, key, {
    cookieOptions: { name: cookieName },
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => {
        // Server Components cannot write cookies. Proxy refreshes them before rendering.
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)) } catch {}
      },
    },
  })
}

export async function getServerSessionToken(): Promise<string | undefined> {
  const store = await cookies()
  const { cookieName } = publicSupabaseConfig()
  let raw = store.get(cookieName)?.value
  if (!raw) {
    const chunks: string[] = []
    let i = 0
    while (store.has(`${cookieName}.${i}`)) {
      chunks.push(store.get(`${cookieName}.${i}`)!.value)
      i++
    }
    if (chunks.length > 0) raw = chunks.join('')
  }
  if (!raw) return undefined
  try {
    let str = raw
    if (str.startsWith('base64-')) {
      str = Buffer.from(str.slice(7), 'base64').toString('utf-8')
    }
    const parsed = JSON.parse(str)
    if (typeof parsed === 'object' && parsed !== null) {
      if (typeof parsed.access_token === 'string') return parsed.access_token
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') return parsed[0]
    }
  } catch {
    if (raw.split('.').length === 3) return raw
  }
  return undefined
}
