const allowed = new Set(['employee', 'roadmap', 'brain', 'deliverables', 'scheduling', 'settings', 'onboarding', 'admin'])
const localePattern = /^(en|ar)$/
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const url = new URL(value, 'https://local.invalid')
    const part = url.pathname.split('/').filter(Boolean)
    if (localePattern.test(part[0] ?? '')) part.shift()
    const resource = part[0] === 'app' ? (part[1] === 'calendar' ? 'scheduling' : part[1]) : part[0]
    const maxParts = part[0] === 'app' ? 2 : part[0] === 'admin' ? 3 : 1
    return url.origin === 'https://local.invalid' && allowed.has(resource) && part.length <= maxParts ? url.pathname + url.search : null
  } catch { return null }
}
export const authCallbackUrl = () => {
 const url = new URL('/auth/callback', window.location.origin)
 const next = safeReturnPath(new URLSearchParams(window.location.search).get('next'))
 if (next) url.searchParams.set('next', next)
 return url.toString()
}