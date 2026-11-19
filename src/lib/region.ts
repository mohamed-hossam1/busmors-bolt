export function formatWorkspaceTime(value: string | Date, timezone: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone, ...options }).format(new Date(value))
}

export function supportedTimezones(): string[] {
  return ['UTC', ...Intl.supportedValuesOf('timeZone')]
}
