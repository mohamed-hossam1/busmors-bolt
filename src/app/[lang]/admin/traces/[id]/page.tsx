import { notFound } from 'next/navigation'
import { getTraceDetail } from '@/server/admin/traces'
import AdminTraceDetail from '@/features/admin/AdminTraceDetail'

export const dynamic = 'force-dynamic'

export default async function AdminTraceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getTraceDetail(id)
  if (!detail) notFound()
  // Plain JSON data only; round-trip strips any non-serializable values.
  return <AdminTraceDetail detail={JSON.parse(JSON.stringify(detail)) as typeof detail} />
}