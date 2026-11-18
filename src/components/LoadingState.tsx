import { Loader2 } from 'lucide-react'

export default function LoadingState({ label = 'Loading Busmora…' }: { label?: string }) {
  return <div role="status" className="flex min-h-48 flex-1 items-center justify-center gap-3 p-8 text-sm text-ink-600"><Loader2 size={20} className="animate-spin text-primary-500" /><span>{label}</span></div>
}
