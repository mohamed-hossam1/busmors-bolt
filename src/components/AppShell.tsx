import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Brain, LogOut, MessageSquare, CalendarDays, FolderOpen, Settings as SettingsIcon, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { supabase } from '../lib/supabase'

export default function AppShell() {
  const { t } = useLang()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const items = [
    { to: '/app/employee', icon: MessageSquare, label: t('navEmployee'), shortLabel: 'Employee' },
    { to: '/app/brain', icon: Brain, label: t('navBrain'), shortLabel: 'Brain' },
    { to: '/app/calendar', icon: CalendarDays, label: t('navCalendar'), shortLabel: 'Calendar' },
    { to: '/app/deliverables', icon: FolderOpen, label: t('navDeliverables'), shortLabel: 'Deliverables' },
    { to: '/app/settings', icon: SettingsIcon, label: t('navSettings'), shortLabel: 'Settings' },
  ]

  const signOut = async () => {
    await supabase.auth.signOut()
    navigate('/signin')
  }

  return (
    <div className="flex h-screen h-[100dvh] w-full flex-col md:flex-row overflow-hidden bg-ink-900">
      {/* Mobile Top Header (visible only on screens < md) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-800 bg-ink-900 px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500 shadow-sm">
            <div className="h-2.5 w-2.5 rotate-45 rounded-sm bg-ink-900" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">busmora</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>
      </header>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer sheet */}
          <div className="fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col bg-ink-900 shadow-2xl animate-fade-up">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
                  <div className="h-3 w-3 rotate-45 rounded-sm bg-ink-900" />
                </div>
                <span className="text-lg font-bold tracking-tight text-white">busmora</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4">
              {items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-500/15 text-primary-400 font-semibold shadow-sm'
                        : 'text-ink-300 hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <Icon size={19} strokeWidth={2} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            {/* User profile & sign out */}
            <div className="border-t border-ink-800 p-4">
              <p className="truncate px-2 pb-2.5 text-xs text-ink-400 font-mono" dir="ltr">
                {session?.user.email}
              </p>
              <button
                onClick={signOut}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
              >
                <LogOut size={18} />
                <span>{t('signOut')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar (hidden on screens < md) */}
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col bg-ink-900">
        <div className="flex items-center gap-2.5 px-5 py-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 shadow-sm">
            <div className="h-3 w-3 rotate-45 rounded-sm bg-ink-900" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">busmora</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-500/15 text-primary-500 font-semibold'
                    : 'text-ink-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={18} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3">
          <p className="truncate px-3 pb-2 text-xs text-ink-400 font-mono" dir="ltr">{session?.user.email}</p>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} />
            {t('signOut')}
          </button>
        </div>
      </aside>

      {/* Main Content Viewport */}
      <main className="flex-1 min-w-0 overflow-hidden bg-ink-50 md:rounded-tl-2xl flex flex-col pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation Bar (visible only on screens < md) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-ink-800/90 bg-ink-900/95 backdrop-blur px-1 md:hidden">
        {items.map(({ to, icon: Icon, shortLabel }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-1 text-center transition-colors ${
                isActive ? 'text-primary-400 font-semibold' : 'text-ink-400 hover:text-ink-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                    isActive ? 'bg-primary-500/15 text-primary-400' : ''
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 line-clamp-1">{shortLabel}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
