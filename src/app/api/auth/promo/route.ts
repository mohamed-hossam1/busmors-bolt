import { createAdminClient } from '@/server/supabase-admin'

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000
const MAX_KEYS = 10_000

const hits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
	const now = Date.now()
	if (hits.size > MAX_KEYS) {
		for (const [key, value] of hits) {
			if (value.resetAt <= now) hits.delete(key)
		}
		if (hits.size > MAX_KEYS) hits.clear()
	}
	const entry = hits.get(ip)
	if (!entry || entry.resetAt <= now) {
		hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
		return false
	}
	entry.count += 1
	return entry.count > RATE_LIMIT
}

function getClientIp(request: Request): string {
	const forwarded = request.headers.get('x-forwarded-for')
	if (forwarded) return forwarded.split(',')[0].trim() || 'unknown'
	return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function GET(request: Request) {
	const ip = getClientIp(request)
	if (isRateLimited(ip)) return Response.json({ valid: false, reason: 'rate_limited' }, { status: 429 })
	const code = new URL(request.url).searchParams.get('code') ?? ''
	if (!code || code.length > 64) return Response.json({ valid: false, reason: 'invalid' })
	const admin = createAdminClient()
	const { data, error } = await admin.rpc('check_promo_code', { p_code: code })
	if (error) return Response.json({ valid: false, reason: 'invalid' })
	return Response.json(data, { status: 200 })
}