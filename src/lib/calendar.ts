const pad = (value: number) => String(value).padStart(2, '0')

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

/** Wall-clock parts of an instant inside a workspace timezone. */
export function zonedParts(value: string | Date, timezone: string): ZonedParts {
  const date = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0'
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  return {
    year,
    month,
    day,
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: weekdayOf(`${year}-${pad(month)}-${pad(day)}`),
  }
}

/**
 * Converts a local wall-clock time (`YYYY-MM-DDTHH:mm`) in a timezone to a UTC
 * ISO instant. Returns null for malformed input or a time that does not exist
 * in that zone (a DST gap). Used on the server and in the browser.
 */
export function localToInstant(local: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  if (Number.isNaN(guess)) return null
  const offsetAt = (instant: number) => {
    const parts = zonedParts(new Date(instant), timeZone)
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant
  }
  let candidate = guess - offsetAt(guess)
  candidate = guess - offsetAt(candidate)
  const check = zonedParts(new Date(candidate), timeZone)
  if (check.year !== year || check.month !== month || check.day !== day || check.hour !== hour || check.minute !== minute) return null
  return new Date(candidate).toISOString()
}

/** Where a post sits on the calendar: its scheduled time, else its proposed time. */
export function planTime(post: { scheduled_for: string | null; proposed_for: string | null }): string | null {
  return post.scheduled_for ?? post.proposed_for
}

/** Stable `YYYY-MM-DD` identity for a calendar day in a workspace timezone. */
export function dayKey(value: string | Date, timezone: string): string {
  const parts = zonedParts(value, timezone)
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export function todayKey(timezone: string): string {
  return dayKey(new Date(), timezone)
}

function keyToUTC(key: string): number {
  const [year, month, day] = key.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

function keyFromUTC(ms: number): string {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDays(key: string, days: number): string {
  return keyFromUTC(keyToUTC(key) + days * 86_400_000)
}

export function weekdayOf(key: string): number {
  return new Date(keyToUTC(key)).getUTCDay()
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekdayOf(key))
}

export function weekKeys(key: string): string[] {
  const start = startOfWeek(key)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

/** Six full weeks so every month renders the same height. */
export function monthGrid(year: number, month: number): string[] {
  const start = startOfWeek(`${year}-${pad(month)}-01`)
  return Array.from({ length: 42 }, (_, index) => addDays(start, index))
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 }
}

export function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
}

export function weekdayShort(key: string): string {
  return new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(keyToUTC(key)))
}

export function dayHeading(key: string): string {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(keyToUTC(key)))
}

export function shortDate(key: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(keyToUTC(key)))
}

export function weekRangeLabel(key: string): string {
  const days = weekKeys(key)
  const first = days[0]
  const last = days[6]
  const firstYear = first.slice(0, 4)
  const lastYear = last.slice(0, 4)
  if (firstYear !== lastYear) return `${shortDate(first)}, ${firstYear} – ${shortDate(last)}, ${lastYear}`
  if (first.slice(5) === last.slice(5)) return `${shortDate(first)} – ${new Date(keyToUTC(last)).getUTCDate()}, ${lastYear}`
  return `${shortDate(first)} – ${shortDate(last)}, ${lastYear}`
}

export function timeLabel(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value))
}

export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const display = hour % 12 === 0 ? 12 : hour % 12
  return `${display} ${suffix}`
}