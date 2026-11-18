import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../context/LangContext'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

export default function SignIn() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { error, busy, run } = useAuthError()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return error.message
      navigate('/app/employee')
      return null
    })
  }

  return (
    <AuthLayout title="Welcome back." subtitle="Sign in to your workspace and pick up where you left off.">
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
          {busy ? 'Signing in…' : t('signIn')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600">
        Are you new here?{' '}
        <Link to="/signup" className="font-semibold text-primary-600 hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  )
}
