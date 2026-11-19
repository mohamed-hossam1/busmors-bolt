import { Suspense } from 'react'
import { requireWorkspace } from '@/server/auth'
import { AuthProvider } from '@/context/AuthContext'
import { TaskRunnerProvider } from '@/features/tasks/TaskRunnerProvider'
import AppShell from '@/components/AppShell'
import { WorkspacePageSkeleton } from '@/components/skeletons'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const initial = await requireWorkspace()
  return (
    <AuthProvider initial={initial}>
      <TaskRunnerProvider>
        <AppShell>
          <Suspense fallback={<WorkspacePageSkeleton />}>
            {children}
          </Suspense>
        </AppShell>
      </TaskRunnerProvider>
    </AuthProvider>
  )
}
