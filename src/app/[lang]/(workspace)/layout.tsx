import { requireWorkspace } from '@/server/auth'
import { AuthProvider } from '@/context/AuthContext'
import AppShell from '@/components/AppShell'

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const initial = await requireWorkspace()
  return (
    <AuthProvider initial={initial}>
      <AppShell>
        {children}
      </AppShell>
    </AuthProvider>
  )
}
