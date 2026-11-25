/**
 * Defense-in-depth sanitization for anything the collector persists.
 *
 * Two layers: (1) callers project only allow-listed fields before handing data
 * to the collector, and (2) every stored string is scrubbed here and truncated,
 * so a secret in a non-allow-listed field never reaches the database.
 */

import { ARRAY_CAP, DEPTH_CAP, MAX_KEYS, STRING_CAP } from './config'

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g, // OpenAI-style
  /\btvly-[A-Za-z0-9-]{6,}\b/g, // Tavily
  /\bfc-[A-Za-z0-9-]{6,}\b/g, // Firecrawl
  /\bAKIA[0-9A-Z]{12,}\b/g, // AWS access key id
  /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g, // Slack
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, // Authorization header value
  /\bAuthorization\s*:\s*[^\r\n]+/gi, // whole header line
  /\b(api[_-]?key|access[_-]?token|token|sig|signature|secret|password)\s*[=:]\s*[^\s&"']{4,}/gi,
]

/** Redact credential-shaped substrings and strip control characters. */
export function scrub(input: string): string {
  let value = input
  for (const pattern of SECRET_PATTERNS) {
    value = value.replace(pattern, (match) => {
      // Keep a recognizable marker without leaking the secret itself.
      if (/^Bearer/i.test(match)) return 'Bearer [REDACTED]'
      if (/^Authorization/i.test(match)) return 'Authorization: [REDACTED]'
      return '[REDACTED]'
    })
  }
  // Drop ASCII control characters except tab/newline/carriage return.
  // oxlint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}

export function scrubString(input: string, cap = STRING_CAP): string {
  return scrub(input).slice(0, cap)
}

/**
 * Bound an arbitrary value for storage: truncate strings, cap arrays and object
 * width, and stop recursing at DEPTH_CAP. The result is a fresh, small structure
 * that shares no reference with the raw provider/tool object.
 */
export function projectValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (depth >= DEPTH_CAP) return '[depth]'
  if (Array.isArray(value)) {
    return value.slice(0, ARRAY_CAP).map((item) => projectValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    let keys = 0
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (keys++ >= MAX_KEYS) break
      if (entry === undefined || typeof entry === 'function') continue
      out[scrubString(key, 120)] = projectValue(entry, depth + 1)
    }
    return out
  }
  return null
}

/** Build a fixed-shape object from an allow-list, dropping anything not listed. */
export function pick(source: unknown, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out
  const record = source as Record<string, unknown>
  for (const field of fields) {
    if (field in record) out[field] = projectValue(record[field])
  }
  return out
}