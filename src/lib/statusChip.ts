const STATUS_CHIP_CLASSES: Record<string, string> = {
  published: 'bg-primary-50 text-primary-700',
  failed: 'bg-red-50 text-red-600',
  rejected: 'bg-ink-100 text-ink-500',
}

const DEFAULT_STATUS_CHIP = 'bg-accent-100 text-accent-700'

/** Returns the badge className for a workflow status. */
export function statusChipClass(status: string | null | undefined): string {
  if (!status) return DEFAULT_STATUS_CHIP
  return STATUS_CHIP_CLASSES[status] ?? DEFAULT_STATUS_CHIP
}