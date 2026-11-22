'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useCopy } from '../../hooks/useCopy'
import { useDialog } from '../../hooks/useDialog'
import type { TranslationKey } from '../../lib/i18n'
import { loadPublishingStatus, type PublishingStatus } from '../../server/publishing-actions'

type ConnectResult = 'connected' | 'failed' | 'no_pages' | 'choose_page'
const RESULTS: ConnectResult[] = ['connected', 'failed', 'no_pages', 'choose_page']

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-primary-600" aria-hidden="true">
      <path d="M14 21v-8h2.7l.4-3H14V8.2c0-.9.3-1.5 1.6-1.5h1.7V4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V10H8.2v3h2.7v8H14Z" fill="currentColor" />
    </svg>
  )
}

async function messageKeyOf(response: Response): Promise<TranslationKey> {
  const body = await response.json().catch(() => null) as { messageKey?: string } | null
  return (body?.messageKey ?? 'facebookConnectFailed') as TranslationKey
}

/** Settings card for the one Facebook Page BUSMORA may publish to. */
export default function FacebookConnectionCard() {
  const { t } = useCopy()
  const [status, setStatus] = useState<PublishingStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<TranslationKey | null>(null)
  // The redirect result is read once from the URL (not via useSearchParams, so the
  // page needs no Suspense boundary). It only renders after the status has loaded,
  // so server and first client render match.
  const [result, setResult] = useState<ConnectResult | null>(() => {
    if (typeof window === 'undefined') return null
    const value = new URLSearchParams(window.location.search).get('facebook') as ConnectResult | null
    return value && RESULTS.includes(value) ? value : null
  })
  const [pages, setPages] = useState<{ id: string; name: string }[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  useDialog(confirmDisconnect, () => setConfirmDisconnect(false))

  const refresh = () => loadPublishingStatus().then(setStatus).catch(() => setStatus({ configured: false, connection: null }))

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (result !== 'choose_page') return
    let alive = true
    fetch('/api/connections/facebook/pages')
      .then(async (response) => {
        if (!alive) return
        if (!response.ok) { setError(await messageKeyOf(response)); return }
        const list = await response.json() as { id: string; name: string }[]
        setPages(list)
        setChosen(list[0]?.id ?? '')
      })
      .catch(() => { if (alive) setError('facebookConnectFailed') })
    return () => { alive = false }
  }, [result])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/connections/facebook/start', { method: 'POST' })
      if (!response.ok) { setError(await messageKeyOf(response)); return }
      const { redirectUrl } = await response.json() as { redirectUrl: string }
      window.location.href = redirectUrl
    } catch {
      setError('facebookConnectFailed')
    } finally {
      setBusy(false)
    }
  }

  const choosePage = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/connections/facebook/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: chosen }) })
      if (!response.ok) { setError(await messageKeyOf(response)); return }
      setPages(null)
      setResult('connected')
      await refresh()
    } catch {
      setError('facebookConnectFailed')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/connections/facebook/disconnect', { method: 'POST' })
      if (!response.ok) { setError(await messageKeyOf(response)); return }
      setConfirmDisconnect(false)
      setResult(null)
      await refresh()
    } catch {
      setError('facebookDisconnectFailed')
    } finally {
      setBusy(false)
    }
  }

  const connection = status?.connection
  const connected = connection?.status === 'connected'
  const badge = connected
    ? <span className="badge bg-emerald-50 text-emerald-700">{t('facebookConnected')}</span>
    : connection?.status === 'expired'
      ? <span className="badge bg-amber-50 text-amber-700">{t('facebookReconnect')}</span>
      : <span className="badge bg-ink-100 text-ink-600">{t('facebookNotConnected')}</span>

  return (
    <section className="card p-4 sm:p-6 border border-ink-200/80 shadow-card">
      <h2 className="mb-4 font-bold text-lg text-ink-900">{t('connectedAccounts')}</h2>
      {!status ? (
        <div className="flex items-center gap-2 text-sm text-ink-400"><Loader2 size={16} className="animate-spin" />{t('loading')}</div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FacebookMark />
            <span className="font-semibold text-ink-900">{t('facebookPage')}</span>
            {status.configured && badge}
            {connected && connection?.pageName && <span className="min-w-0 truncate text-sm text-ink-600">· {connection.pageName}</span>}
          </div>

          {!status.configured ? (
            <p className="text-sm text-ink-500">{t('publishingNotConfigured')}</p>
          ) : connected ? (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmDisconnect(true)}>{t('facebookDisconnect')}</button>
          ) : (
            <button type="button" className="btn-primary flex items-center gap-2" disabled={busy} onClick={connect}>
              {busy && <Loader2 size={16} className="animate-spin" />}{t('facebookConnect')}
            </button>
          )}

          {pages && pages.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium text-ink-700">{t('facebookChoosePage')}</legend>
              {pages.map((page) => (
                <label key={page.id} className="input-field flex cursor-pointer items-center gap-2">
                  <input type="radio" name="facebook-page" value={page.id} checked={chosen === page.id} onChange={() => setChosen(page.id)} />
                  <span className="min-w-0 truncate">{page.name}</span>
                </label>
              ))}
              <button type="button" className="btn-primary" disabled={busy || !chosen} onClick={choosePage}>{t('facebookUsePage')}</button>
            </fieldset>
          )}

          {result === 'connected' && connected && <p className="text-sm text-emerald-700">{t('facebookResultConnected')}</p>}
          {result === 'failed' && <p className="text-sm text-red-600">{t('facebookResultFailed')}</p>}
          {result === 'no_pages' && <p className="text-sm text-amber-700">{t('facebookResultNoPages')}</p>}
          {error && <p className="text-xs text-red-600">{t(error)}</p>}
        </div>
      )}

      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => setConfirmDisconnect(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('facebookDisconnect')} className="card modal-panel w-full max-w-lg p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-ink-900">{t('facebookDisconnect')}</h3>
            <p className="mt-2 text-sm text-ink-600">{t('facebookDisconnectWarning')}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmDisconnect(false)}>{t('cancel')}</button>
              <button type="button" className="btn-danger flex items-center gap-2" disabled={busy} onClick={disconnect}>
                {busy && <Loader2 size={16} className="animate-spin" />}{t('facebookDisconnect')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
