import type { Metadata } from 'next'
import { requireAdminPage } from '@/server/admin/auth'
import TraceExplorer from '@/features/admin/TraceExplorer'

export const metadata: Metadata = { title: 'Trace Explorer · Busmora Admin' }

export default async function AdminTracesPage() {
  await requireAdminPage()
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <TraceExplorer />
    </div>
  )
}