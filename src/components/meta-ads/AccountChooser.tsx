'use client'

import { useEffect, useState } from 'react'
import { useCopy } from '@/hooks/useCopy'
import type { TranslationKey } from '@/lib/i18n'
import { Spinner } from '@/components/ui/Spinner'

interface AdAccountOption {
  id: string
  name: string
  currency: string
  timezoneName: string
}

async function messageKeyOf(response: Response): Promise<TranslationKey> {
  const body = (await response.json().catch(() => null)) as { messageKey?: string } | null
  return (body?.messageKey ?? 'adsConnectFailed') as TranslationKey
}

export default function AccountChooser({ onDone }: { onDone: () => void }) {
  const { t } = useCopy()
  const [accounts, setAccounts] = useState<AdAccountOption[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState(false)
  const [reconnect, setReconnect] = useState(false)
  const [error, setError] = useState<TranslationKey | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/connections/meta-ads/accounts')
      .then(async (response) => {
        if (!alive) return
        if (response.status === 409) {
          const body = (await response.json().catch(() => null)) as { code?: string } | null
          if (body?.code === 'reconnect') {
            setReconnect(true)
            return
          }
          setError(await messageKeyOf(response))
          return
        }
        if (!response.ok) {
          setError(await messageKeyOf(response))
          return
        }
        const data = (await response.json()) as { accounts: AdAccountOption[] }
        setAccounts(data.accounts)
        setChosen(data.accounts[0]?.id ?? '')
      })
      .catch(() => {
        if (alive) setError('adsConnectFailed')
      })
    return () => {
      alive = false
    }
  }, [])

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/connections/meta-ads/start', { method: 'POST' })
      if (!response.ok) {
        setError(await messageKeyOf(response))
        return
      }
      const { redirectUrl } = (await response.json()) as { redirectUrl: string }
      window.location.href = redirectUrl
    } catch {
      setError('adsConnectFailed')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!chosen) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/connections/meta-ads/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adAccountId: chosen }),
      })
      if (!response.ok) {
        if (response.status === 409) {
          const body = (await response.json().catch(() => null)) as { code?: string } | null
          if (body?.code === 'reconnect') {
            setReconnect(true)
            return
          }
        }
        setError(await messageKeyOf(response))
        return
      }
      onDone()
    } catch {
      setError('adsConnectFailed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-ink-900">{t('adsChooseAccount')}</h2>

      {reconnect ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink-600">{t('adsReconnect')}</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={connect}>
            {busy && <Spinner size={16} />}
            {t('adsConnect')}
          </button>
        </div>
      ) : accounts === null ? (
        <div className="flex items-center gap-2 text-sm text-ink-400">
          <Spinner size={16} />
          {t('loading')}
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-ink-600">{t('adsNoAccounts')}</p>
      ) : (
        <div className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('adsChooseAccount')}</legend>
            {accounts.map((account) => (
              <label
                key={account.id}
                className={`card flex cursor-pointer items-center gap-3 p-3 ${chosen === account.id ? 'ring-2 ring-primary-400' : ''}`}
              >
                <input
                  type="radio"
                  name="meta-ads-account"
                  value={account.id}
                  checked={chosen === account.id}
                  onChange={() => setChosen(account.id)}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink-900">{account.name}</span>
                  <span className="block text-xs text-ink-500">{account.currency} · {account.timezoneName}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="btn-primary" disabled={busy || !chosen} onClick={confirm}>
            {busy && <Spinner size={16} />}
            {t('adsChooseConfirm')}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{t(error)}</p>}
    </section>
  )
}