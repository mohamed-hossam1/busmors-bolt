import { Link } from '@/shared/i18n'
import type { LucideIcon } from 'lucide-react'

export default function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: { to: string; label: string } }) {
  return (
    <div className="card flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
      <p className="mb-2 flex items-center gap-2">
        <Icon size={16} className="text-primary-500" />
        {title}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-600">{description}</p>
      {action && <Link href={action.to} className="btn-primary mt-6">{action.label}</Link>}
    </div>
  )
}
