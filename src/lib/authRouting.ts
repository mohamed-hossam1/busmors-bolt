const allowed = new Set(['employee', 'roadmap', 'brain', 'deliverables', 'scheduling', 'settings', 'onboarding'])
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const url = new URL(value, 'https://local.invalid')
    const part = url.pathname.split('/').filter(Boolean)
    const resource = part[0] === 'app' ? part[1] === 'calendar' ? 'scheduling' : part[1] : part[0]
    return url.origin === 'https://local.invalid' && allowed.has(resource) && part.length <= (part[0] === 'app' ? 2 : 1) ? url.pathname + url.search : null
  } catch { return null }
}
export function rememberReturnPath(value: unknown) {
  const path = safeReturnPath(value)
  try { if (path) sessionStorage.setItem('busmora:auth-return', path) } catch { /* Optional navigation hint. */ }
}
export function takeReturnPath(): string | null {
  try { const path = sessionStorage.getItem('busmora:auth-return'); sessionStorage.removeItem('busmora:auth-return'); return safeReturnPath(path) } catch { return null }
}
export const authCallbackUrl = () => `${window.location.origin}/auth/callback`
