import type { Metadata, Viewport } from 'next'
import '../index.css'
export const metadata: Metadata = {
 title: 'BusMora — Turn business knowledge into marketing work',
 description: 'Turn your business knowledge into research, social posts, and content plans with BusMora, your AI Marketing Director.',
 icons: { icon: '/brand/busmora-logo.svg' },
 openGraph: { title: 'BusMora — Your AI Marketing Director', description: 'Bring your brand context into research, social posts, and content plans—all in one workspace.', type: 'website' },
 twitter: { card: 'summary' },
}
export const viewport: Viewport = { themeColor: '#171926' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
 return <html lang="en" dir="ltr"><body><div id="root">{children}</div></body></html>
}
