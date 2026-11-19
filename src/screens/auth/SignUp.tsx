'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { useCopy } from '../../hooks/useCopy'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

import GoogleButton from '../../components/auth/GoogleButton'


export default function SignUp() {
  const { t } = useCopy()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, setError, busy, run } = useAuthError()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError(('Use at least 8 characters.'))
      return
    }
    void run(async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      if (error) return ('Unable to create the account. Check your email and password, then try again.')
      if (!data.session) return 'Your account could not be signed in. Please contact the workspace administrator.'
      router.replace('/onboarding'); router.refresh()
      return null
    })
  }

  return (
    <AuthLayout title={('Create your workspace')} subtitle={('Your business context. Your next useful step.')}>

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
