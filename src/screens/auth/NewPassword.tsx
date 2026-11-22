'use client'

import { useState } from 'react'
import { Link } from '@/shared/i18n'
import { useLocaleRouter as useRouter } from '@/context/I18nContext'
import AuthLayout, { AuthField, useAuthError } from '../../components/auth/AuthLayout'
import { useAuth } from '../../context/AuthContext'
import { useCopy } from '../../hooks/useCopy'
import { supabase } from '../../lib/supabase'
export default function NewPassword() {
  const { session, settings } = useAuth(); const { t } = useCopy(); const router = useRouter()
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('')
  const { error, setError, busy, run } = useAuthError()
  return <AuthLayout title={t('newPassword')} subtitle={t('newPasswordSubtitle')}>
    {!session ? <Link className="btn-primary" href="/reset">{t('resetPassword')}</Link> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (password !== confirm) return setError(t('passwordMismatch')); if (password.length < 8) return setError(t('passwordMinLength')); void run(async () => { const { error } = await supabase.auth.updateUser({ password }); if (error) return t('passwordUpdateError'); router.replace(settings?.onboarding_state === 'complete' ? '/employee' : '/onboarding'); return null }) }}>
      <AuthField label={t('password')} type="password" autoComplete="new-password" value={password} onChange={setPassword} /><AuthField label={t('confirmPassword')} type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button className="btn-primary w-full" disabled={busy}>{busy ? t('saving') : t('newPassword')}</button>
    </form>}
  </AuthLayout>
}
