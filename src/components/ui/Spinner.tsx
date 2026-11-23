import { Loader2 } from 'lucide-react'

/** Inline spinning indicator. Renders the same lucide Loader2 with animate-spin. */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`.trim()} />
}