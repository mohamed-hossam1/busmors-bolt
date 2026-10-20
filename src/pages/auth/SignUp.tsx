import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../context/LangContext'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

export default function SignUp() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [companyName, setCompanyName] = useState("")
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const { error, setError, busy, run } = useAuthError()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('passwordMismatch'))
      return
    }
    void run(async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { company_name: companyName } },
      })
      if (error) return error.message
      const userId = data.user?.id
      if (userId) {
        await supabase.from('workspaces').insert({ id: userId, name: companyName || 'My Company' })
        await supabase.from('workspace_settings').insert({ workspace_id: userId })
      }
      navigate('/onboarding')
      return null
    })
  }

  return (
    <AuthLayout title="Create your workspace" subtitle="Start building your Business Brain in minutes">

      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('companyName')} type="text" value={companyName} onChange={setCompanyName} placeholder="Acme Corp" />
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} placeholder="you@company.com" />
        <AuthField label={t('password')} type="password" value={password} onChange={setPassword} />
        <AuthField label={t('confirmPassword')} type="password" value={confirm} onChange={setConfirm} />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {t('signUp')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/signin" className="font-semibold text-primary-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
