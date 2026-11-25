import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin · Busmora',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh min-h-0 flex-col bg-ink-50 text-ink-900">{children}</div>
}