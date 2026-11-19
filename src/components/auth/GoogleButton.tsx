import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { authCallbackUrl } from '../../lib/authRouting'
import { useCopy } from '../../hooks/useCopy'
export default function GoogleButton() {
  const { t } = useCopy()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const connect = async () => {
    setBusy(true); setError(false)
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: authCallbackUrl() } })
      if (error) throw error
    } catch { setError(true); setBusy(false) }
  }
  return <div className="mb-6 space-y-3"><button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => void connect()}><span aria-hidden="true" className="text-lg font-semibold">G</span>{busy ? t('loading') : t('google')}</button>{error && <p role="alert" className="text-sm text-red-700">{('Google sign-in is unavailable. Try again or use email.')}</p>}<div className="flex items-center gap-3 text-xs text-ink-500"><span className="h-px flex-1 bg-ink-200" />{('or use email')}<span className="h-px flex-1 bg-ink-200" /></div></div>
}
