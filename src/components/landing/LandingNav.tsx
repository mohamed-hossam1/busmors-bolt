import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

export default function LandingNav() {
  const [open, setOpen] = useState(false)
  const links = [
    ['How it works', '#how-it-works'],
    ['Try the demo', '#demo'],
    ['FAQ', '#faq'],
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-ink-900/5 bg-[#fbfdfb]/90 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8" aria-label="Main navigation">
        <Link to="/" className="flex items-center gap-2.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary-500 shadow-sm" aria-hidden="true">
            <span className="h-3 w-3 rotate-45 rounded-[3px] bg-ink-900" />
          </span>
          <span className="text-lg font-bold tracking-[-0.04em] text-ink-900">busmora</span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="text-sm font-medium text-ink-600 transition-colors hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              {label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/signin" className="px-3 py-2 text-sm font-semibold text-ink-700 hover:text-ink-900">Sign in</Link>
          <Link to="/signup" className="btn-primary !px-4 !py-2">Create account</Link>
        </div>

        <button type="button" onClick={() => setOpen((value) => !value)} className="grid h-10 w-10 place-items-center rounded-xl border border-ink-200 bg-white text-ink-800 md:hidden" aria-expanded={open} aria-controls="mobile-navigation" aria-label={open ? 'Close navigation' : 'Open navigation'}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {open && (
        <div id="mobile-navigation" className="border-t border-ink-100 bg-white px-5 py-5 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {links.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">{label}</a>
            ))}
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-100 pt-4">
              <Link to="/signin" className="btn-secondary">Sign in</Link>
              <Link to="/signup" className="btn-primary">Create account</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
