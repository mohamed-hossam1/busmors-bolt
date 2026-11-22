import 'server-only'
import type { NextResponse } from 'next/server'
import type { ApiFailure } from '../../lib/contracts'

export const CONNECT_COOKIE = 'fb_connect'
export const PENDING_COOKIE = 'fb_pending'
const COOKIE_PATH = '/api/connections/facebook'

/** httpOnly, 10 minutes, Lax, scoped to the connection routes, Secure in production. */
export function setFlowCookie(response: NextResponse, name: string, value: string) {
  response.cookies.set(name, value, { httpOnly: true, sameSite: 'lax', path: COOKIE_PATH, maxAge: 600, secure: process.env.NODE_ENV === 'production' })
}

export function clearFlowCookie(response: NextResponse, name: string) {
  response.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', path: COOKIE_PATH, maxAge: 0, secure: process.env.NODE_ENV === 'production' })
}

export function failure(status: number, code: string, messageKey: string) {
  const body: ApiFailure = { code, messageKey }
  return Response.json(body, { status })
}

export const notConfigured = () => failure(503, 'publishing_not_configured', 'publishingNotConfigured')
