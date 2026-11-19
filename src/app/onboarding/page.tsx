import { requireWorkspace } from '@/server/auth'
import { AuthProvider } from '@/context/AuthContext'
import Onboarding from '@/screens/Onboarding'
export default async function Page() { const initial = await requireWorkspace(false); return <AuthProvider initial={initial}><Onboarding /></AuthProvider> }
