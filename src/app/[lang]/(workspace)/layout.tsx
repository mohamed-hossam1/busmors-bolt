import { requireWorkspace } from '@/server/auth'
import { AuthProvider } from '@/context/AuthContext'
import AppShell from '@/components/AppShell'
import { isMetaAdsEnabled } from '@/server/meta-ads/provider'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const initial = await requireWorkspace()
  const adsEnabled = isMetaAdsEnabled()
  return (
    <AuthProvider initial={initial}>
      <AppShell adsEnabled={adsEnabled}>
        {children}
      </AppShell>
    </AuthProvider>
  )
}
