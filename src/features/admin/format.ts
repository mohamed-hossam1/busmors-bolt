/** Formatting helpers for the admin observability UI (pure, client-safe). */

/** Format a millisecond duration into a compact human string (e.g. 1.2s, 850ms). */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`
  const minutes = Math.floor(seconds / 60)
  const rem = Math.round(seconds % 60)
  return `${minutes}m ${rem}s`
}

/** Derive a trace duration in ms from started/completed timestamps. */
export function traceDurationMs(startedAt: string | null, completedAt: string | null): number | null {
  if (!startedAt || !completedAt) return null
  const start = Date.parse(startedAt)
  const end = Date.parse(completedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return end - start
}

/** Compact token count with thousands separator. */
export function formatTokens(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US')
}

/** Format an ISO timestamp for display; returns an em dash when absent/invalid. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

/** Short, single-line snippet of a free-text field for table cells. */
export function snippet(value: string | null | undefined, max = 80): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Pretty-print an unknown payload as escaped-by-React JSON text. */
export function stringifyPayload(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700',
  success: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  running: 'bg-blue-100 text-blue-700',
  queued: 'bg-ink-100 text-ink-600',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  active: 'bg-emerald-100 text-emerald-700',
  redeemed: 'bg-primary-100 text-primary-700',
  reserved: 'bg-amber-100 text-amber-700',
  revoked: 'bg-red-100 text-red-700',
}

/** Tailwind classes for a status pill. */
export function statusClasses(status: string | null | undefined): string {
  const key = (status ?? '').toLowerCase()
  return STATUS_STYLES[key] ?? 'bg-ink-100 text-ink-600'
}