import { stripLocale } from './i18n'

const allowed = new Set(['employee', 'roadmap', 'brain', 'deliverables', 'scheduling', 'settings', 'onboarding', 'admin'])
const localePattern = /^(en|ar)$/
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  try {
    const url = new URL(value, 'https://local.invalid')
    const part = url.pathname.split('/').filter(Boolean)
    if (localePattern.test(part[0] ?? '')) part.shift()
    const resource = part[0] === 'app' ? (part[1] === 'calendar' ? 'scheduling' : part[1]) : part[0]
    const maxLen = part[0] === 'app' ? 2 : resource === 'admin' ? 3 : 1
    return url.origin === 'https://local.invalid' && allowed.has(resource) && part.length <= maxLen ? url.pathname + url.search : null
  } catch { return null }
}
export const authCallbackUrl = () => {
 const url = new URL('/auth/callback', window.location.origin)
 const next = safeReturnPath(new URLSearchParams(window.location.search).get('next'))
 if (next) url.searchParams.set('next', next)
 return url.toString()
}

export function isSameOriginRequest(request: Request): boolean {
  if (['GET', 'HEAD'].includes(request.method)) return true
  const origin = request.headers.get('origin')
  if (!origin) return true
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const host = forwardedHost || request.headers.get('host') || new URL(request.url).host
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

const AUTH_ROUTES = /^\/(signin|signup|reset)(\/|$)/

export function shouldRedirectOAuthCode(pathname: string, hasCode: boolean): boolean {
  if (!hasCode) return false
  if (pathname.split('/')[1] === 'auth') return false
  return !AUTH_ROUTES.test(stripLocale(pathname))
}