import { Suspense } from 'react'
import type { Metadata } from 'next'
import { requireAdminPage } from '@/server/admin/auth'
import TraceExplorer from '@/features/admin/TraceExplorer'
import { buildTraceSearchString, parseTraceSearchParams } from '@/features/admin/traceQuery'

export const metadata: Metadata = { title: 'Trace Explorer · Busmora Admin' }

export default async function AdminTracesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const parsed = parseTraceSearchParams(sp)
  const qs = buildTraceSearchString(parsed.filters, parsed.page, parsed.accountEmail)
  await requireAdminPage(qs ? `/admin/traces?${qs}` : '/admin/traces')
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <Suspense fallback={null}>
        <TraceExplorer />
      </Suspense>
    </div>
  )
}