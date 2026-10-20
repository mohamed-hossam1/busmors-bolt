import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LangProvider } from './context/LangContext'
import AppShell from './components/AppShell'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import ResetPassword from './pages/auth/ResetPassword'
import Onboarding from './pages/Onboarding'
import EmployeePage from './pages/EmployeePage'
import BrainPage from './pages/BrainPage'
import CalendarPage from './pages/CalendarPage'
import DeliverablesPage from './pages/DeliverablesPage'
import SettingsPage from './pages/SettingsPage'
import ErrorBoundary from './components/ErrorBoundary'
import LandingPage from './pages/LandingPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
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
          </BrowserRouter>
        </ErrorBoundary>
      </AuthProvider>
    </LangProvider>
  )
}
