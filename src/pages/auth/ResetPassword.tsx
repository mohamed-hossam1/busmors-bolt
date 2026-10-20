import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useLang } from '../../context/LangContext'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'

export default function ResetPassword() {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const { notice, setNotice, busy, run } = useAuthError()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await supabase.auth.resetPasswordForEmail(email)
      setNotice(t('resetSent'))
      return null
    })
  }

  return (
    <AuthLayout title="Reset password" subtitle="We'll send a reset link to your email">
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={t('email')} type="email" value={email} onChange={setEmail} />
        {notice && <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800">{notice}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {t('resetPassword')}
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
