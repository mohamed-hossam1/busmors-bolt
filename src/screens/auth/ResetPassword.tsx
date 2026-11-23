'use client'

import { useState, type FormEvent } from 'react'
import { Link } from '@/shared/i18n'
import { supabase } from '../../lib/supabase'
import { useCopy } from '../../hooks/useCopy'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'
import { useRedirectIfAuthenticated } from '../../hooks/useRedirectIfAuthenticated'

export default function ResetPassword() {
  const { t } = useCopy()
  const [email, setEmail] = useState('')
  const { error, notice, setNotice, busy, run } = useAuthError()

  const session = useRedirectIfAuthenticated('/employee')

  if (session) {
    return null
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?flow=recovery` })
      if (error) return t('resetRequestError')
      setNotice(t('resetSent'))
      return null
    })
  }

  return (
    <AuthLayout title={t('resetPasswordTitle')} subtitle={t('resetPasswordSubtitle')}>
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">{notice}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t('loading') : t('resetPassword')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/signin" className="font-semibold text-primary-600 hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </AuthLayout>
  )
}
