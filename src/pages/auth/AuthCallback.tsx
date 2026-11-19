import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCopy } from '../../hooks/useCopy'
import { takeReturnPath } from '../../lib/authRouting'
import AuthLayout from '../../components/auth/AuthLayout'
import LoadingState from '../../components/LoadingState'
export default function AuthCallback() {
  const { session, settings, loading, error, recovery } = useAuth()
  const { t } = useCopy()
  const navigate = useNavigate()
  const [expired, setExpired] = useState(false)
  const callbackError = new URLSearchParams(location.search).has('error') || new URLSearchParams(location.hash.slice(1)).has('error')
  useEffect(() => { const id = setTimeout(() => setExpired(true), 15000); return () => clearTimeout(id) }, [])
  useEffect(() => {
    if (callbackError || loading || !session || !settings || error) return
    if (recovery || new URLSearchParams(location.search).get('flow') === 'recovery') navigate('/auth/new-password', { replace: true })
    else navigate(settings.onboarding_state === 'complete' ? takeReturnPath() ?? '/employee' : '/onboarding', { replace: true })
  }, [session, settings, loading, error, recovery, callbackError, navigate])
  if (!callbackError && !error && !expired) return <LoadingState fullScreen label={t('loading')} />
  return <AuthLayout title={('This link could not be completed')} subtitle={('It may have expired, already been used, or been cancelled. Request a fresh link in this browser.')}><div className="flex flex-wrap gap-3"><Link className="btn-primary" to="/verify-email">{t('resend')}</Link><Link className="btn-secondary" to="/reset">{t('resetPassword')}</Link><Link className="btn-secondary" to="/signin">{t('signIn')}</Link></div></AuthLayout>
}
