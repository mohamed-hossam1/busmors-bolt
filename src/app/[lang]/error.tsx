'use client'
import { useCopy } from '@/hooks/useCopy'
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
 const { t } = useCopy()
 return <div className="grid min-h-screen place-content-center gap-4 bg-ink-50 p-6"><h1 className="text-xl font-semibold">{t('workspaceLoadFailed')}</h1><p role="alert">{t('savedWorkSafe')}</p><button className="btn-primary" onClick={reset}>{t('retryButton')}</button></div>
}