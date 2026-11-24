import { requireWorkspace } from '@/server/auth'
import { AuthProvider } from '@/context/AuthContext'
import { TaskRunnerProvider } from '@/features/tasks/TaskRunnerProvider'
import AppShell from '@/components/AppShell'
import { isMetaAdsEnabled } from '@/server/meta-ads/provider'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const initial = await requireWorkspace()
  const adsEnabled = isMetaAdsEnabled()
  return (
    <AuthProvider initial={initial}>
      <TaskRunnerProvider>
        <AppShell adsEnabled={adsEnabled}>
          {children}
        </AppShell>
      </TaskRunnerProvider>
    </AuthProvider>
  )
}
