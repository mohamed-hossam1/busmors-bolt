import { requireWorkspace } from '@/server/auth'
import { AuthProvider } from '@/context/AuthContext'
import { TaskRunnerProvider } from '@/features/tasks/TaskRunnerProvider'
import AppShell from '@/components/AppShell'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const initial = await requireWorkspace()
  return (
    <AuthProvider initial={initial}>
      <TaskRunnerProvider>
        <AppShell>
          {children}
        </AppShell>
      </TaskRunnerProvider>
    </AuthProvider>
  )
}
