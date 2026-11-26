import { z } from 'zod'
import { createAdminClient } from '@/server/supabase-admin'
import { createServerSupabase } from '@/server/supabase'
import { normalizePhone } from '@/lib/phone'

const RATE_LIMIT = 10
const RATE_WINDOW_MS = 10 * 60_000
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

const signupSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8).max(128),
	phone: z.string(),
	promoCode: z.string(),
})

const RESERVE_MESSAGES: Record<string, string> = {
	INVALID_PROMO_CODE: 'Invalid promo code.',
	PROMO_REVOKED: 'This promo code has been revoked.',
	PROMO_EXPIRED: 'This promo code has expired.',
	PROMO_ALREADY_USED: 'This promo code has already been used.',
	PHONE_ALREADY_REGISTERED: 'This phone number is already registered.',
}

export async function POST(request: Request) {
	const ip = getClientIp(request)
	if (isRateLimited(ip)) return Response.json({ error: 'Too many attempts.', code: 'RATE_LIMITED' }, { status: 429 })
	let parsed: z.infer<typeof signupSchema>
	try {
		parsed = signupSchema.parse(await request.json())
	} catch {
		return Response.json({ error: 'Invalid input.', code: 'INVALID_INPUT' }, { status: 400 })
	}
	const body = parsed
	const phoneResult = normalizePhone(body.phone)
	if (!phoneResult.ok) return Response.json({ error: 'Invalid phone number.', code: 'INVALID_PHONE' }, { status: 400 })
	const normalizedCode = body.promoCode.trim().toUpperCase()
	if (!normalizedCode) return Response.json({ error: 'Promo code is required.', code: 'INVALID_PROMO_CODE' }, { status: 400 })
	const normalizedEmail = body.email.trim().toLowerCase()
	const admin = createAdminClient()
	const reservationToken = crypto.randomUUID()
	const { data: reserve, error: reserveError } = await admin.rpc('reserve_promo_signup', { p_code: normalizedCode, p_phone: phoneResult.normalized, p_reservation_token: reservationToken })
	if (reserveError) return Response.json({ error: 'Signup could not be completed.', code: 'SIGNUP_FAILED' }, { status: 500 })
	if (!reserve?.ok) {
		const errorCode = reserve.errorCode as string
		return Response.json({ error: RESERVE_MESSAGES[errorCode] ?? 'Signup could not be completed.', code: errorCode }, { status: 409 })
	}
	const { data: created, error: createError } = await admin.auth.admin.createUser({ email: normalizedEmail, password: body.password, email_confirm: true, user_metadata: { phone_number: phoneResult.normalized } })
	if (createError || !created.user) {
		await admin.rpc('release_promo_signup', { p_code: normalizedCode, p_reservation_token: reservationToken })
		const status = (createError as { status?: number } | null)?.status
		const message = createError?.message ?? ''
		if (status === 422 || /already|registered|exists/i.test(message)) return Response.json({ error: 'Email already registered.', code: 'EMAIL_ALREADY_EXISTS' }, { status: 409 })
		return Response.json({ error: 'Account could not be created.', code: 'SIGNUP_FAILED' }, { status: 400 })
	}
	const { data: finalize, error: finalizeError } = await admin.rpc('finalize_promo_signup', { p_user_id: created.user.id, p_code: normalizedCode, p_phone: phoneResult.normalized, p_email: normalizedEmail, p_reservation_token: reservationToken })
	if (finalizeError || !finalize?.ok) {
		await admin.auth.admin.deleteUser(created.user.id)
		await admin.rpc('release_promo_signup', { p_code: normalizedCode, p_reservation_token: reservationToken })
		return Response.json({ error: 'Signup could not be completed.', code: 'SIGNUP_FAILED' }, { status: 500 })
	}
	const serverSupabase = await createServerSupabase()
	const { error: signInError } = await serverSupabase.auth.signInWithPassword({ email: normalizedEmail, password: body.password })
	if (signInError) return Response.json({ error: 'Account created but could not be signed in.', code: 'SESSION_FAILED' }, { status: 500 })
	return Response.json({ ok: true, redirectTo: '/onboarding' }, { status: 201 })
}