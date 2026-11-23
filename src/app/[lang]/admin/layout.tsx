import { requireAdminPage } from '@/server/admin/auth'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage()
  return <div className="min-h-screen bg-ink-50 text-ink-900">{children}</div>
}