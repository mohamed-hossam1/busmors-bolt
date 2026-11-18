import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../context/LangContext'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

export default function ResetPassword() {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const { error, notice, setNotice, busy, run } = useAuthError()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) return error.message
      setNotice(t('resetSent'))
      return null
    })
  }

  return (
    <AuthLayout title="Reset password" subtitle="We'll send a reset link to your email">
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} />
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">{notice}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Sending link…' : t('resetPassword')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link to="/signin" className="font-semibold text-primary-600 hover:underline">
          {t('signIn')}
        </Link>
      </p>
    </AuthLayout>
  )
}
