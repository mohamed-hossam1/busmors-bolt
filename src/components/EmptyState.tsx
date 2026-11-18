import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

export default function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: { to: string; label: string } }) {
  return (
    <div className="card flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary-200 bg-primary-50 text-primary-500"><Icon size={25} strokeWidth={1.6} /></span>
      <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-600">{description}</p>
      {action && <Link to={action.to} className="btn-primary mt-6">{action.label}</Link>}
    </div>
  )
}
