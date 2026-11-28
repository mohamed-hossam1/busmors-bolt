import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdminPage } from '@/server/admin/auth'
import { getTraceDetail } from '@/server/admin/traces'
import TraceInspector from '@/features/admin/TraceInspector'
import { buildTraceSearchString, parseTraceSearchParams } from '@/features/admin/traceQuery'

export const metadata: Metadata = { title: 'Trace Inspector · Busmora Admin' }

export default async function AdminTraceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const parsed = parseTraceSearchParams(sp)
  const backQuery = buildTraceSearchString(parsed.filters, parsed.page, parsed.accountEmail)
  await requireAdminPage(backQuery ? `/admin/traces/${id}?${backQuery}` : `/admin/traces/${id}`)
  const detail = await getTraceDetail(id)
  if (!detail) notFound()
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <TraceInspector detail={detail} backQuery={backQuery} />
    </div>
  )
}