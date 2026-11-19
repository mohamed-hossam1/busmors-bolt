import { Suspense } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import LoadingState from '@/components/LoadingState'
export default function AuthLayout({ children }: { children: React.ReactNode }) { return <AuthProvider><Suspense fallback={<LoadingState fullScreen />}>{children}</Suspense></AuthProvider> }
