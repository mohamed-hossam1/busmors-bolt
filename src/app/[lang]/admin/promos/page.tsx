import type { Metadata } from 'next'
import { requireAdminPage } from '@/server/admin/auth'
import PromoManager from '@/features/admin/PromoManager'

export const metadata: Metadata = { title: 'Promo Codes · Busmora Admin' }

export default async function AdminPromosPage() {
  await requireAdminPage('/admin/promos')
  return (
    <div className="min-h-0 flex-1 overflow-y-auto sleek-scrollbar print:overflow-visible">
      <PromoManager />
    </div>
  )
}