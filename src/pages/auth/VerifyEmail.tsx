import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'
import { useCopy } from '../../hooks/useCopy'
import { supabase } from '../../lib/supabase'
import { authCallbackUrl } from '../../lib/authRouting'
export default function VerifyEmail() {
  const { t } = useCopy()
  const location = useLocation()
  const [email, setEmail] = useState<string>(location.state?.email ?? '')
  const [cooldown, setCooldown] = useState(0)
  const { error, notice, setNotice, busy, run } = useAuthError()
  useEffect(() => { if (!cooldown) return; const id = setTimeout(() => setCooldown(v => v - 1), 1000); return () => clearTimeout(id) }, [cooldown])
  return <AuthLayout title={t('verifyEmail')} subtitle={('Open the verification link in your email to continue. If it expired, request a new one below.')}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: authCallbackUrl() } })
      if (error) return ('Unable to resend yet. Check the address and try again shortly.')
      setCooldown(60); setNotice(('Verification email requested. Check your inbox and spam folder.')); return null
    }) }}>
      <AuthField label={t('email')} type="email" value={email} onChange={setEmail} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{notice && <p role="status" className="text-sm text-primary-700">{notice}</p>}
      <button className="btn-primary w-full" disabled={busy || cooldown > 0}>{cooldown ? `${t('resend')} (${cooldown})` : t('resend')}</button>
    </form><Link className="mt-6 block text-center text-sm text-primary-700" to="/signin">{t('signIn')}</Link>
  </AuthLayout>
}
