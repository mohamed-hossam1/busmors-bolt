'use client'

import { useCopy } from '@/hooks/useCopy'
import { formatWorkspaceTime } from '@/lib/region'

export default function ReportStatusCard({
  kind,
  retryAt,
  timezone,
  onConnect,
  onRetry,
}: {
  kind: 'reconnect' | 'retry' | 'cooldown'
  retryAt?: string
  timezone: string
  onConnect: () => void
  onRetry: () => void
}) {
  const { t } = useCopy()
  return (
    <div className="card flex flex-col items-center gap-4 p-8 text-center">
      {kind === 'reconnect' && (
        <>
          <p className="text-sm text-ink-600">{t('adsReconnect')}</p>
          <button type="button" className="btn-primary" onClick={onConnect}>{t('adsConnect')}</button>
        </>
      )}
      {kind === 'retry' && (
        <>
          <p className="text-sm text-ink-600">{t('adsSyncFailed')}</p>
          <button type="button" className="btn-secondary" onClick={onRetry}>{t('adsRetry')}</button>
        </>
      )}
      {kind === 'cooldown' && (
        <p className="text-sm text-ink-600">
          {t('adsRefreshCooldown', { time: retryAt ? formatWorkspaceTime(retryAt, timezone, { dateStyle: undefined }) : '' })}
        </p>
      )}
    </div>
  )
}