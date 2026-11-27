import type { Metadata } from 'next'
import { getAdminIdentity } from '@/server/admin/auth'
import AdminNav from '@/features/admin/AdminNav'

export const metadata: Metadata = {
  title: 'Admin · Busmora',
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminIdentity()
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-ink-50 text-ink-900 print:h-auto print:overflow-visible print:bg-white">
      {session && <AdminNav email={session.user.email ?? null} />}
      {children}
    </div>
  )
}