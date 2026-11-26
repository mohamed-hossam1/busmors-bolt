'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@/shared/i18n'
import { useSearchParams } from 'next/navigation'
import { useLocaleRouter as useRouter } from '@/context/I18nContext'
import { useCopy } from '../../hooks/useCopy'
import { isGoogleAuthEnabled } from '../../lib/authFlags'
import { normalizePhone } from '../../lib/phone'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'
import GoogleButton from '../../components/auth/GoogleButton'
import { useRedirectIfAuthenticated } from '../../hooks/useRedirectIfAuthenticated'

type PromoState = {
  state: 'idle' | 'checking' | 'valid' | 'invalid' | 'used' | 'expired' | 'revoked'
  limit?: number
}

function mapPromoReason(reason?: string): PromoState {
  if (reason === 'used') return { state: 'used' }
  if (reason === 'expired') return { state: 'expired' }
  if (reason === 'revoked') return { state: 'revoked' }
  return { state: 'invalid' }
}

export default function SignUp() {
  const { t } = useCopy()
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialPromo = (searchParams.get('promo') ?? searchParams.get('code') ?? '').trim().toUpperCase()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [promoCode, setPromoCode] = useState(initialPromo)
  const [promoStatus, setPromoStatus] = useState<PromoState>({ state: initialPromo ? 'checking' : 'idle' })
  const { error, setError, busy, run } = useAuthError()

  const session = useRedirectIfAuthenticated('/employee')

  const checkPromo = async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) {
      setPromoStatus({ state: 'idle' })
      return
    }
    setPromoStatus({ state: 'checking' })
    try {
      const res = await fetch(`/api/auth/promo?code=${encodeURIComponent(trimmed)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.valid) {
        setPromoStatus({ state: 'valid', limit: data.heavyTasksLimit })
        return
      }
      if (res.status === 429) {
        setPromoStatus({ state: 'invalid' })
        return
      }
      setPromoStatus(mapPromoReason(data?.reason))
    } catch {
      setPromoStatus({ state: 'invalid' })
    }
  }

  useEffect(() => {
    if (!initialPromo) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/auth/promo?code=${encodeURIComponent(initialPromo)}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data.valid) {
          setPromoStatus({ state: 'valid', limit: data.heavyTasksLimit })
          return
        }
        if (res.status === 429) {
          setPromoStatus({ state: 'invalid' })
          return
        }
        setPromoStatus(mapPromoReason(data?.reason))
      } catch {
        if (!cancelled) setPromoStatus({ state: 'invalid' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialPromo])

  if (session) {
    return null
  }

  const promoStatusNode = (() => {
    if (promoStatus.state === 'valid') {
      return <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">{t('promoCodeValid', { limit: promoStatus.limit ?? 0 })}</span>
    }
    if (promoStatus.state === 'checking') {
      return <span className="text-ink-500">{t('promoCodeChecking')}</span>
    }
    if (promoStatus.state === 'used') {
      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{t('promoCodeUsed')}</span>
    }
    if (promoStatus.state === 'expired') {
      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{t('promoCodeExpired')}</span>
    }
    if (promoStatus.state === 'revoked') {
      return <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{t('promoCodeRevoked')}</span>
    }
    if (promoStatus.state === 'invalid') {
      return <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">{t('promoCodeInvalid')}</span>
    }
    return null
  })()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!promoCode.trim()) {
      setError(t('promoCodeRequired'))
      return
    }
    if (password.length < 8) {
      setError(t('passwordMinLength'))
      return
    }
    const phoneResult = normalizePhone(phone)
    if (!phoneResult.ok) {
      setError(t('phoneInvalid'))
      return
    }
    void run(async () => {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, phone, promoCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        switch (data?.code) {
          case 'INVALID_PROMO_CODE':
            return promoCode.trim() ? t('promoCodeInvalid') : t('promoCodeRequired')
          case 'PROMO_ALREADY_USED':
            return t('promoCodeUsed')
          case 'PROMO_EXPIRED':
            return t('promoCodeExpired')
          case 'PROMO_REVOKED':
            return t('promoCodeRevoked')
          case 'PHONE_ALREADY_REGISTERED':
            return t('phoneAlreadyRegistered')
          case 'INVALID_PHONE':
            return t('phoneInvalid')
          case 'EMAIL_ALREADY_EXISTS':
            return t('emailAlreadyExists')
          default:
            return t('signUpFailed')
        }
      }
      router.replace('/onboarding'); router.refresh()
      return null
    })
  }

  return (
    <AuthLayout title={t('signUpTitle')} subtitle={t('signUpSubtitle')}>
      {isGoogleAuthEnabled() && <GoogleButton />}
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
        <AuthField label={t('phoneNumber')} type="tel" value={phone} onChange={setPhone} placeholder={t('phonePlaceholder')} />
        <AuthField label={t('password')} type="password" autoComplete="new-password" value={password} onChange={setPassword} />
        <AuthField
          label={t('promoCode')}
          type="text"
          value={promoCode}
          onChange={(v) => setPromoCode(v.toUpperCase())}
          onBlur={() => { void checkPromo(promoCode) }}
          placeholder={t('promoCodePlaceholder')}
          status={promoStatusNode}
        />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t('loading') : t('signUp')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600"><Link href="/signin" className="font-semibold text-primary-600 hover:underline">{t('haveAccount')}</Link></p>
    </AuthLayout>
  )
}