import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useCopy } from './hooks/useCopy'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingState from './components/LoadingState'
import { TaskRunnerProvider } from './features/tasks/TaskRunnerProvider'

const AppShell = lazy(() => import('./components/AppShell'))
const SignIn = lazy(() => import('./pages/auth/SignIn'))
const SignUp = lazy(() => import('./pages/auth/SignUp'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'))
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback'))
const NewPassword = lazy(() => import('./pages/auth/NewPassword'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const EmployeePage = lazy(() => import('./pages/EmployeePage'))
const BrainPage = lazy(() => import('./pages/BrainPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const DeliverablesPage = lazy(() => import('./pages/DeliverablesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

function Protected({ children, setup = true }: { children: React.ReactNode; setup?: boolean }) {
  const { session, settings, loading, error, refreshSettings } = useAuth()
  const { t } = useCopy()
  const location = useLocation()
  if (loading) return <LoadingState fullScreen label={t('loading')} />
  if (!session) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (error) return <div className="grid min-h-screen place-content-center gap-4 bg-ink-50 p-6"><h1 className="text-xl font-semibold">{('Workspace setup needs attention')}</h1><p role="alert" className="max-w-lg text-sm text-red-700">{('Unable to load your workspace. Retry, or check that the database migrations are installed.')}</p><button className="btn-primary" onClick={() => void refreshSettings()}>{t('retry')}</button></div>
  if (setup && settings?.onboarding_state !== 'complete') return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
function CompatibilityRoute({ path }: { path: string }) {
  const { search } = useLocation()
  return <Navigate to={path + search} replace />
}
export default function App() {
  return <AuthProvider><ErrorBoundary><BrowserRouter><Suspense fallback={<LoadingState fullScreen />}><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/signin" element={<SignIn />} />
    <Route path="/signup" element={<SignUp />} />
    <Route path="/reset" element={<ResetPassword />} />
    <Route path="/verify-email" element={<VerifyEmail />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/auth/new-password" element={<NewPassword />} />
    <Route path="/onboarding" element={<Protected setup={false}><Onboarding /></Protected>} />
    <Route element={<Protected><TaskRunnerProvider><AppShell /></TaskRunnerProvider></Protected>}>
      <Route path="/employee" element={<EmployeePage />} />
      <Route path="/brain" element={<BrainPage />} />
      <Route path="/scheduling" element={<CalendarPage />} />
      <Route path="/deliverables" element={<DeliverablesPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
    <Route path="/app" element={<Navigate to="/employee" replace />} />
    {['employee','brain','deliverables','settings','roadmap'].map(path => <Route key={path} path={`/app/${path}`} element={<CompatibilityRoute path={`/${path}`} />} />)}
    <Route path="/app/calendar" element={<CompatibilityRoute path="/scheduling" />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense></BrowserRouter></ErrorBoundary></AuthProvider>
}
