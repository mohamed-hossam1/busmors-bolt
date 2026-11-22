import { Suspense } from 'react'
import { requireWorkspace } from '@/server/auth'
import { AuthProvider } from '@/context/AuthContext'
import Onboarding from '@/screens/Onboarding'
import { OnboardingSkeleton } from '@/components/skeletons'

export default async function Page() {
  const initial = await requireWorkspace(false)
  return (
    <AuthProvider initial={initial}>
      <Suspense fallback={<OnboardingSkeleton />}>
        <Onboarding />
      </Suspense>
    </AuthProvider>
  )
}
