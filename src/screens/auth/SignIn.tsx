'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from '@/shared/i18n'
import { useSearchParams } from 'next/navigation'
import { useLocaleRouter as useRouter } from '@/context/I18nContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '../../lib/supabase'
import { useCopy } from '../../hooks/useCopy'
import { isGoogleAuthEnabled } from '../../lib/authFlags'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

import GoogleButton from '../../components/auth/GoogleButton'
import { safeReturnPath } from '../../lib/authRouting'

export default function SignIn() {
  const { t } = useCopy()
  const params = useSearchParams()
  const router = useRouter()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, busy, run } = useAuthError()

  const nextTarget = safeReturnPath(params.get('next'))
  const resolvedRef = useRef(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!session || resolvedRef.current || submittingRef.current || nextTarget) return
    resolvedRef.current = true
    void (async () => {
      try {
        const res = await fetch('/api/admin/me', { cache: 'no-store' })
        router.replace(res.ok ? '/admin/promos' : '/employee')
      } catch {
        router.replace('/employee')
      }
      router.refresh()
    })()
  }, [session, nextTarget, router])

  if (session) {
    return null
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    submittingRef.current = true
    void run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        submittingRef.current = false
        return error.message || t('signInFailed')
      }
      resolvedRef.current = true
      if (nextTarget) {
        router.replace(nextTarget)
      } else {
        try {
          const res = await fetch('/api/admin/me', { cache: 'no-store' })
          router.replace(res.ok ? '/admin/promos' : '/employee')
        } catch {
          router.replace('/employee')
        }
      }
      router.refresh()
      return null
    })
  }

  return (
    <AuthLayout title={t('signInTitle')} subtitle={t('signInSubtitle')}>
      {params.has('error') && params.get('error') !== 'invite_required' && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t('signInError')}</p>}
      {params.get('error') === 'invite_required' && <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">{t('inviteRequiredError')}</p>}
      {isGoogleAuthEnabled() && <GoogleButton />}
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
        <AuthField label={t('password')} type="password" value={password} onChange={setPassword} />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div>
          <Link href="/reset" className="text-sm font-medium text-primary-600 hover:underline">
            {t('forgotPassword')}
          </Link>
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t('loading') : t('signIn')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600"><Link href="/signup" className="font-semibold text-primary-600 hover:underline">{t('noAccount')}</Link></p>
    </AuthLayout>
  )
}