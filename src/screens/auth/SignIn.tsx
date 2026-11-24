'use client'

import { useState, type FormEvent } from 'react'
import { Link } from '@/shared/i18n'
import { useSearchParams } from 'next/navigation'
import { useLocaleRouter as useRouter } from '@/context/I18nContext'
import { supabase } from '../../lib/supabase'
import { useCopy } from '../../hooks/useCopy'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

import GoogleButton from '../../components/auth/GoogleButton'
import { safeReturnPath } from '../../lib/authRouting'
import { useRedirectIfAuthenticated } from '../../hooks/useRedirectIfAuthenticated'
import { checkIsAdminUser } from '../../server/admin/actions'

export default function SignIn() {
  const { t } = useCopy()
  const params = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, busy, run } = useAuthError()

  const session = useRedirectIfAuthenticated(safeReturnPath(params.get('next')) ?? '/employee')

  if (session) {
    return null
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return error.message || t('signInFailed')
      const isAdmin = await checkIsAdminUser({ id: data.user?.id, email: data.user?.email ?? email })
      if (isAdmin) {
        router.replace('/admin')
        router.refresh()
        return null
      }
      router.replace(safeReturnPath(params.get('next')) ?? '/employee')
      router.refresh()
      return null
    })
  }

  return (
    <AuthLayout title={t('signInTitle')} subtitle={t('signInSubtitle')}>
      {params.has('error') && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{t('signInError')}</p>}
      <GoogleButton />
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
