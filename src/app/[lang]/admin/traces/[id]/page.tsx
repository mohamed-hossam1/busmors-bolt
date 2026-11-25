import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdminPage } from '@/server/admin/auth'
import { getTraceDetail } from '@/server/admin/traces'
import TraceInspector from '@/features/admin/TraceInspector'

export const metadata: Metadata = { title: 'Trace Inspector · Busmora Admin' }

export default async function AdminTraceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdminPage()
  const { id } = await params
  const detail = await getTraceDetail(id)
  if (!detail) notFound()
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <TraceInspector detail={detail} />
    </div>
  )
}