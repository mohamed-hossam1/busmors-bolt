'use client'

import { ShieldCheck } from 'lucide-react'
import Brand from '@/components/Brand'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { Link } from '@/shared/i18n'
import { useLocalePathname, useLocaleRouter, useTranslate } from '@/context/I18nContext'
import { supabase } from '@/lib/supabase'

const TABS = [
  { href: '/admin/promos', key: 'adminNavPromos' },
  { href: '/admin/traces', key: 'adminNavTraces' },
] as const

export default function AdminNav({ email }: { email: string | null }) {
  const t = useTranslate()
  const pathname = useLocalePathname()
  const router = useLocaleRouter()

  const signOut = async () => {
    await supabase.auth.signOut()
    router.replace('/signin')
    router.refresh()
  }

  return (
    <header
      data-admin-nav
      className="flex flex-wrap items-center gap-3 border-b border-ink-200 bg-white px-4 py-3 sm:px-6 print:hidden"
    >
      <div className="flex items-center gap-2">
        <Brand compact href="/admin/promos" />
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <ShieldCheck className="h-4 w-4 text-primary-500" aria-hidden="true" />
          {t('adminNavTitle')}
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-primary-50 text-primary-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`}
            >
              {t(tab.key)}
            </Link>
          )
        })}
      </nav>

      <div className="ms-auto flex items-center gap-2">
        {email && (
          <span className="hidden max-w-[16rem] truncate rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600 sm:inline">
            {email}
          </span>
        )}
        <LanguageSwitcher />
        <button
          type="button"
          onClick={signOut}
          className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
        >
          {t('signOut')}
        </button>
      </div>
    </header>
  )
}