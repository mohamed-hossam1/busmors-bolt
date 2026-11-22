'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCopy } from './useCopy'
import { loadPublishingStatus, type PublishingStatus } from '../server/publishing-actions'

/**
 * Publishing status and the Page name for Facebook previews. Loads once per screen
 * (call it only in the top-level screen component and pass the values down).
 */
export function usePublishingStatus(): { status: PublishingStatus | null; pageName: string; reload: () => void } {
  const { t } = useCopy()
  const [status, setStatus] = useState<PublishingStatus | null>(null)
  const reload = useCallback(() => {
    loadPublishingStatus().then(setStatus).catch(() => { /* the fallback name stays */ })
  }, [])
  useEffect(() => {
    let alive = true
    loadPublishingStatus().then((value) => { if (alive) setStatus(value) }).catch(() => { /* the fallback name stays */ })
    return () => { alive = false }
  }, [])
  const connected = status?.connection?.status === 'connected' && status.connection.pageName
  return { status, pageName: connected ? status!.connection!.pageName! : t('fbPageFallback'), reload }
}

/** Page name for Facebook previews (screens that do not need the full status). */
export function usePreviewPageName(): string {
  return usePublishingStatus().pageName
}
