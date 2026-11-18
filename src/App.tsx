import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import ErrorBoundary from './components/ErrorBoundary'
import LoadingState from './components/LoadingState'

const AppShell = lazy(() => import('./components/AppShell'))
const SignIn = lazy(() => import('./pages/auth/SignIn'))
const SignUp = lazy(() => import('./pages/auth/SignUp'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const EmployeePage = lazy(() => import('./pages/EmployeePage'))
const BrainPage = lazy(() => import('./pages/BrainPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const DeliverablesPage = lazy(() => import('./pages/DeliverablesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <LoadingState label="Opening your workspace…" />
    )
  }
  if (!session) return <Navigate to="/signin" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <ErrorBoundary>
          <BrowserRouter>
            <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/reset" element={<ResetPassword />} />
              <Route
                path="/onboarding"
                element={
                  <Protected>
                    <Onboarding />
                  </Protected>
                }
              />
              <Route
                path="/app"
                element={
                  <Protected>
                    <AppShell />
                  </Protected>
                }
              >
                <Route index element={<Navigate to="employee" replace />} />
                <Route path="employee" element={<EmployeePage />} />
                <Route path="brain" element={<BrainPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="deliverables" element={<DeliverablesPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </LangProvider>
  )
}
import { lazy, Suspense } from 'react'
