'use client'

import { useEffect, useState } from 'react'
import { useCopy } from './useCopy'
import { loadPublishingStatus } from '../server/publishing-actions'

/**
 * Page name for Facebook previews. Loads the publishing status once per screen
 * (call this only in the top-level screen component and pass the name down).
 */
export function usePreviewPageName(): string {
  const { t } = useCopy()
  const [pageName, setPageName] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    loadPublishingStatus()
      .then((status) => {
        if (alive && status.connection?.status === 'connected' && status.connection.pageName) setPageName(status.connection.pageName)
      })
      .catch(() => { /* the fallback name stays */ })
    return () => { alive = false }
  }, [])
  return pageName ?? t('fbPageFallback')
}
