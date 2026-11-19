import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useCopy } from '../../hooks/useCopy'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

import GoogleButton from '../../components/auth/GoogleButton'
import { rememberReturnPath } from '../../lib/authRouting'

export default function SignIn() {
  const { t } = useCopy()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, busy, run } = useAuthError()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return ('Sign-in failed. Check your details and verify your email.')
      rememberReturnPath(params.get('next'))
      navigate('/auth/callback')
      return null
    })
  }

  return (
    <AuthLayout title={('Welcome back.')} subtitle={('Sign in to your business workspace.')}>
      <GoogleButton />
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
        <AuthField label={t('password')} type="password" value={password} onChange={setPassword} />
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div>
          <Link to="/reset" className="text-sm font-medium text-primary-600 hover:underline">
            {t('forgotPassword')}
          </Link>
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? t('loading') : t('signIn')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600"><Link to="/signup" className="font-semibold text-primary-600 hover:underline">{t('noAccount')}</Link></p>
      <Link to="/verify-email" className="mt-3 block text-center text-sm text-primary-600">{t('resend')}</Link>
    </AuthLayout>
  )
}
