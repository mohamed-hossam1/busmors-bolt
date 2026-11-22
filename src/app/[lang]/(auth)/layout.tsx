import { Suspense } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import { AuthSkeleton } from '@/components/skeletons'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Suspense fallback={<AuthSkeleton />}>
        {children}
      </Suspense>
    </AuthProvider>
  )
}
