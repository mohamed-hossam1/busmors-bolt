'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import { useCopy } from '@/hooks/useCopy'
import { useLocale } from '@/context/I18nContext'
import { useDialog } from '@/hooks/useDialog'
import { Link } from '@/shared/i18n'
import type { TranslationKey } from '@/lib/i18n'
import { formatWorkspaceTime } from '@/lib/region'
import EmptyState from '@/components/EmptyState'
import LoadingState from '@/components/LoadingState'
import AccountChooser from '@/components/meta-ads/AccountChooser'
import ReportStatusCard from '@/components/meta-ads/ReportStatusCard'
import KpiTiles from '@/components/meta-ads/KpiTiles'
import DailyTrendChart from '@/components/meta-ads/DailyTrendChart'
import AdsList from '@/components/meta-ads/AdsList'
import { reportStatus, shouldAutoSync, summarySentence, type ReportBanner, type SyncUiState } from '@/features/meta-ads/view-model'
import type { AdsReport } from '@/features/meta-ads/contracts'
import type { AdsReportView } from '@/server/meta-ads/view'

type ConnectedView = Extract<AdsReportView, { state: 'connected' }>

type SyncResponse =
  | { status: 'synced' }
  | { status: 'skipped'; reason: 'fresh' | 'cooldown'; retryAt: string | null }
  | { status: 'failed'; code?: string }

function ReportBannerRow({ banner, retryAt, timezone, onConnect }: { banner: ReportBanner; retryAt?: string; timezone: string; onConnect: () => void }) {
  const { t } = useCopy()
  if (banner === 'updating') return <span className="badge bg-primary-50 text-primary-700">{t('adsUpdating')}</span>
  if (banner === 'reconnect') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="badge bg-amber-50 text-amber-700">{t('adsReconnect')}</span>
        <button type="button" className="btn-primary px-3 py-1 text-xs" onClick={onConnect}>{t('adsConnect')}</button>
      </span>
    )
  }
  if (banner === 'retry') return <span className="badge bg-red-50 text-red-600">{t('adsSyncFailed')}</span>
  return (
    <span className="badge bg-ink-100 text-ink-600">
      {t('adsRefreshCooldown', { time: retryAt ? formatWorkspaceTime(retryAt, timezone, { dateStyle: undefined }) : '' })}
    </span>
  )
}

function ReportDashboard({ report, locale }: { report: AdsReport; locale: 'ar' | 'en' }) {
  const { t } = useCopy()
  const summary = summarySentence(report, locale)
  return (
    <div className="space-y-5">
      <p className="workspace-description">{t(summary.key, summary.values)}</p>
      <KpiTiles summary={report.summary} currency={report.currency} locale={locale} />
      <DailyTrendChart daily={report.daily} />
      <AdsList ads={report.ads} currency={report.currency} locale={locale} />
    </div>
  )
}

function ConnectedDashboard({ view, locale, onConnect }: { view: ConnectedView; locale: 'ar' | 'en'; onConnect: () => void }) {
  const { t } = useCopy()
  const router = useRouter()
  const [sync, setSync] = useState<SyncUiState>(() => (shouldAutoSync(view) ? { phase: 'syncing' } : { phase: 'idle' }))
  const started = useRef(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  useDialog(confirmDisconnect, () => setConfirmDisconnect(false))

  const runSync = async (manual: boolean) => {
    setSync({ phase: 'syncing' })
    try {
      const response = await fetch('/api/meta-ads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: view.preset, manual }),
      })
      if (!response.ok) {
        setSync({ phase: 'error', code: 'provider_error' })
        return
      }
      const body = (await response.json()) as SyncResponse
      if (body.status === 'synced') {
        setSync({ phase: 'idle' })
        router.refresh()
        return
      }
      if (body.status === 'skipped') {
        if (body.reason === 'cooldown') setSync({ phase: 'skipped', code: 'cooldown', retryAt: body.retryAt ?? undefined })
        else setSync({ phase: 'idle' })
        return
      }
      setSync({ phase: 'error', code: body.code ?? 'provider_error' })
    } catch {
      setSync({ phase: 'error', code: 'provider_error' })
    }
  }

  useEffect(() => {
    if (!started.current && shouldAutoSync(view)) {
      started.current = true
      void runSync(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const disconnect = async () => {
    try {
      const response = await fetch('/api/connections/meta-ads/disconnect', { method: 'POST' })
      if (!response.ok) return
      setConfirmDisconnect(false)
      router.refresh()
    } catch {
      /* ignore */
    }
  }

  const status = reportStatus({ hasReport: view.report !== null, sync, lastError: view.lastError })
  const timezone = view.account.timezoneName

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 border-b border-ink-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{view.account.name}</p>
          {view.fetchedAt && (
            <p className="text-xs text-ink-500">{t('adsLastUpdated', { time: formatWorkspaceTime(view.fetchedAt, timezone) })}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2">
            <Link href="/ads?range=7d" className={view.preset === 'last_7d' ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'}>{t('adsRange7')}</Link>
            <Link href="/ads?range=30d" className={view.preset === 'last_30d' ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-secondary px-3 py-1.5 text-xs'}>{t('adsRange30')}</Link>
          </div>
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={sync.phase === 'syncing'} onClick={() => void runSync(true)}>{t('adsRefresh')}</button>
          <button type="button" className="px-2 py-1.5 text-xs font-semibold text-red-600 hover:underline" onClick={() => setConfirmDisconnect(true)}>{t('adsDisconnect')}</button>
        </div>
      </div>

      {status.kind === 'loading' && <LoadingState />}
      {(status.kind === 'reconnect' || status.kind === 'retry' || status.kind === 'cooldown') && (
        <ReportStatusCard
          kind={status.kind}
          retryAt={status.kind === 'cooldown' ? status.retryAt : undefined}
          timezone={timezone}
          onConnect={onConnect}
          onRetry={() => void runSync(true)}
        />
      )}
      {status.kind === 'report' && view.report && (
        <div className="space-y-4">
          {status.banner && (
            <div>
              <ReportBannerRow banner={status.banner} retryAt={status.retryAt} timezone={timezone} onConnect={onConnect} />
            </div>
          )}
          <ReportDashboard report={view.report} locale={locale} />
        </div>
      )}

      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={() => setConfirmDisconnect(false)}>
          <div role="dialog" aria-modal="true" aria-label={t('adsDisconnect')} className="card modal-panel max-h-[90dvh] w-full max-w-lg overflow-y-auto p-4 sm:p-6" onClick={(event) => event.stopPropagation()}>
            <h3 className="font-bold text-ink-900">{t('adsDisconnect')}</h3>
            <p className="mt-2 text-sm text-ink-600">{t('adsDisconnectConfirm')}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDisconnect(false)}>{t('cancel')}</button>
              <button type="button" className="btn-danger" onClick={disconnect}>{t('adsDisconnect')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdsReportPage({ view }: { view: AdsReportView }) {
  const { t } = useCopy()
  const { locale } = useLocale()
  const router = useRouter()
  const params = useSearchParams()
  const meta = params.get('meta')
  const [connectError, setConnectError] = useState<TranslationKey | null>(null)

  const connect = async () => {
    setConnectError(null)
    try {
      const response = await fetch('/api/connections/meta-ads/start', { method: 'POST' })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { messageKey?: string } | null
        setConnectError((body?.messageKey ?? 'adsConnectFailed') as TranslationKey)
        return
      }
      const { redirectUrl } = (await response.json()) as { redirectUrl: string }
      window.location.href = redirectUrl
    } catch {
      setConnectError('adsConnectFailed')
    }
  }

  return (
    <div className="workspace-page">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center gap-3">
          <span className="brain-page-heading"><BarChart3 size={22} /></span>
          <h1 className="workspace-heading">{t('adsTitle')}</h1>
        </header>

        {meta === 'no_accounts' && (
          <p className="mb-4"><span className="badge bg-amber-50 text-amber-700">{t('adsNoAccounts')}</span></p>
        )}
        {meta === 'failed' && (
          <p className="mb-4"><span className="badge bg-red-50 text-red-600">{t('adsConnectFailed')}</span></p>
        )}

        {view.state === 'not_connected' && (
          <div className="flex flex-col items-center gap-4">
            <EmptyState icon={BarChart3} title={t('adsConnectTitle')} description={t('adsConnectBody')} />
            <button type="button" className="btn-primary" onClick={connect}>{t('adsConnect')}</button>
            {connectError && <p className="text-xs text-red-600">{t(connectError)}</p>}
          </div>
        )}

        {view.state === 'choose_account' && <AccountChooser onDone={() => router.refresh()} />}

        {view.state === 'connected' && <ConnectedDashboard view={view} locale={locale} onConnect={connect} />}
      </div>
    </div>
  )
}