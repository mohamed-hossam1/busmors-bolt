import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Brain, LogOut, MessageSquare, CalendarDays, FolderOpen, Settings, Menu, X, Sparkles, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { supabase } from '../lib/supabase'
import { useDialog } from '../hooks/useDialog'
import Brand from './Brand'

export default function AppShell() {
  const { t } = useLang()
  const { session } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  useDialog(mobileMenuOpen, () => setMobileMenuOpen(false))

  const items = [
    { to: '/app/employee', icon: MessageSquare, label: t('navEmployee'), shortLabel: 'Director' },
    { to: '/app/brain', icon: Brain, label: t('navBrain'), shortLabel: 'Brain' },
    { to: '/app/calendar', icon: CalendarDays, label: t('navCalendar'), shortLabel: 'Calendar' },
    { to: '/app/deliverables', icon: FolderOpen, label: t('navDeliverables'), shortLabel: 'Deliverables' },
    { to: '/app/settings', icon: Settings, label: t('navSettings'), shortLabel: 'Settings' },
  ]
  const current = items.find((item) => item.to === pathname)
  const signOut = async () => {
    setSigningOut(true)
    const { error } = await supabase.auth.signOut()
    setSigningOut(false)
    if (!error) navigate('/signin')
  }
  const navigation = (
    <nav aria-label="Workspace navigation" className="flex-1 space-y-2 overflow-y-auto px-1 py-4">
      <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[.16em] text-stage-subtle">Workspace</p>
      {items.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} onClick={() => setMobileMenuOpen(false)} className="dashboard-nav-link">
          <Icon size={18} strokeWidth={1.7} /><span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
  const account = (
    <div className="dashboard-account m-1 p-3">
      <div className="flex items-center gap-2.5 pb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/20 text-sm font-semibold text-primary-300">{session?.user.email?.[0]?.toUpperCase() ?? 'B'}</span>
        <div className="min-w-0"><p className="text-xs font-medium text-white">Your workspace</p><p className="mt-1 truncate text-[11px] text-stage-muted">{session?.user.email}</p></div>
      </div>
      <button disabled={signingOut} onClick={signOut} className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-stage-muted transition hover:bg-white/10 hover:text-white disabled:opacity-50"><LogOut size={15} />{signingOut ? 'Signing out…' : t('signOut')}</button>
    </div>
  )

  return (
    <div className="dashboard-stage">
      <div className="dashboard-frame dashboard-theme flex h-full w-full flex-col overflow-hidden text-ink-900 md:flex-row">
        <a href="#workspace-content" className="sr-only z-[60] rounded-lg bg-white p-3 text-primary-700 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <header className="flex h-16 shrink-0 items-center justify-between bg-cosmic-card px-4 md:hidden">
          <Brand light />
          <button type="button" aria-label="Open navigation menu" aria-expanded={mobileMenuOpen} aria-controls="workspace-mobile-menu" onClick={() => setMobileMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white hover:bg-cosmic-active"><Menu size={20} /></button>
        </header>
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-cosmic-deep/70 md:hidden" onClick={() => setMobileMenuOpen(false)}>
            <div id="workspace-mobile-menu" role="dialog" aria-modal="true" aria-label="Workspace navigation" className="dashboard-sidebar fixed inset-y-0 start-0 flex w-80 max-w-[90vw] flex-col p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between pb-5"><Brand light /><button aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-xl text-stage-muted hover:bg-cosmic-active"><X size={20} /></button></div>
              {navigation}{account}
            </div>
          </div>
        )}
        <aside className="dashboard-desktop-sidebar dashboard-sidebar hidden shrink-0 flex-col md:flex">
          <div className="px-3 pb-6 pt-4"><Brand light /></div>
          <div className="mx-1 flex items-center gap-2.5 rounded-xl border border-white/10 bg-cosmic-raised px-3 py-3.5"><Sparkles size={17} className="text-primary-300" /><div><p className="text-xs font-medium text-white">Made for your business</p><p className="mt-1 text-[10px] text-stage-subtle">Context. Direction. Useful work.</p></div></div>
          {navigation}{account}
          <p className="px-4 pb-2 pt-4 text-[10px] text-stage-subtle">Your business at the center.</p>
        </aside>
        <main id="workspace-content" className="dashboard-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <header className="dashboard-topbar hidden shrink-0 items-center justify-between gap-4 px-7 md:flex">
            <div className="flex items-center gap-2 text-xs text-ink-600"><span>Workspace</span><ChevronRight size={13} /><span className="font-medium text-ink-900">{current?.label}</span></div>
            <span className="flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-3 py-2 text-[11px] text-ink-600"><Sparkles size={13} className="text-primary-500" />Busmora workspace</span>
          </header>
          <div className="dashboard-content flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><Outlet /></div>
        </main>
        <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-center justify-around gap-1 border-t border-ink-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] md:hidden">
          {items.map(({ to, icon: Icon, shortLabel }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] transition ${isActive ? 'bg-primary-50 font-semibold text-primary-700' : 'text-ink-600 hover:bg-ink-50'}`}><Icon size={19} strokeWidth={1.8} /><span>{shortLabel}</span></NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
