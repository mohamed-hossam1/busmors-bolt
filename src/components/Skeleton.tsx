interface SkeletonProps {
  width?: number | string
  height?: number | string
  className?: string
  rounded?: string
}

/** Minimal animated placeholder used while content loads. */
export default function Skeleton({
  width = '100%',
  height = '1rem',
  className = '',
  rounded = 'rounded-lg',
}: SkeletonProps = {}) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-ink-200/70 ${rounded} ${className}`}
      style={{ width, height }}
    />
  )
}