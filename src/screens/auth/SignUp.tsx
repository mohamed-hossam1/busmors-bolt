'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { Link } from '@/shared/i18n'
import { useLocaleRouter as useRouter } from '@/context/I18nContext'
import { supabase } from '../../lib/supabase'
import { useCopy } from '../../hooks/useCopy'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'
import { useAuth } from '../../context/AuthContext'

import GoogleButton from '../../components/auth/GoogleButton'


export default function SignUp() {
  const { t } = useCopy()
  const { session, loading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, setError, busy, run } = useAuthError()

  useEffect(() => {
    if (session) {
      router.replace('/employee')
    }
  }, [session, router])

  if (session) {
    return null
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError(t('passwordMinLength'))
      return
    }
    void run(async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) return t('signUpFailed')
      if (!data.session) return t('sessionError')
      router.replace('/onboarding'); router.refresh()
      return null
    })
  }

  return (
    <AuthLayout title={t('signUpTitle')} subtitle={t('signUpSubtitle')}>

      <GoogleButton />
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
        <AuthField label={t('password')} type="password" autoComplete="new-password" value={password} onChange={setPassword} />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t('loading') : t('signUp')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600"><Link href="/signin" className="font-semibold text-primary-600 hover:underline">{t('haveAccount')}</Link></p>
    </AuthLayout>
  )
}
