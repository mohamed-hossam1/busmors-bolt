import { Link } from 'react-router-dom'

export default function Brand({ light = false, compact = false, href = '/' }: { light?: boolean; compact?: boolean; href?: string }) {
  const className = `inline-flex shrink-0 items-center gap-2.5 ${light ? 'text-white' : 'text-ink-900'}`
  const content = (
    <>
      <img src="/brand/busmora-logo.svg" width="52" height="40" alt="" className="h-10 w-auto shrink-0 object-contain" />
      {!compact && <span className="text-xl font-semibold tracking-[-.055em]">busmora<span className="text-primary-400">.</span></span>}
    </>
  )
  return href.startsWith('#')
    ? <a href={href} aria-label="Busmora home" className={className}>{content}</a>
    : <Link to={href} aria-label="Busmora home" className={className}>{content}</Link>
}
