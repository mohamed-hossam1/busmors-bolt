import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'
import { useAuth } from '../../context/AuthContext'
import { useCopy } from '../../hooks/useCopy'
import { supabase } from '../../lib/supabase'
export default function NewPassword() {
  const { session, settings } = useAuth(); const { t } = useCopy(); const navigate = useNavigate()
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('')
  const { error, setError, busy, run } = useAuthError()
  return <AuthLayout title={t('newPassword')} subtitle={('Use at least 8 characters for your new password.')}>
    {!session ? <Link className="btn-primary" to="/reset">{t('resetPassword')}</Link> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (password !== confirm) return setError(t('passwordMismatch')); if (password.length < 8) return setError(('Use at least 8 characters.')); void run(async () => { const { error } = await supabase.auth.updateUser({ password }); if (error) return ('Unable to update your password. Request a new recovery link.'); navigate(settings?.onboarding_state === 'complete' ? '/employee' : '/onboarding', { replace: true }); return null }) }}>
      <AuthField label={t('password')} type="password" autoComplete="new-password" value={password} onChange={setPassword} /><AuthField label={t('confirmPassword')} type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button className="btn-primary w-full" disabled={busy}>{busy ? t('saving') : t('newPassword')}</button>
    </form>}
  </AuthLayout>
}
