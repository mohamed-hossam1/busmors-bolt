/**
 * Bounds for the execution-observability collector.
 *
 * The collector runs on the customer request path, so every projection it builds
 * is bounded here: strings are truncated, arrays and object depth are capped,
 * and the whole per-trace buffer is capped by both event count and bytes. When
 * the buffer is full the newest event is dropped (the trace row records that it
 * was truncated) rather than blocking the request.
 */

export const STRING_CAP = 2048
export const ARRAY_CAP = 50
export const DEPTH_CAP = 3
export const MAX_KEYS = 50

export const TOOL_INPUT_CAP = 8 * 1024
export const TOOL_OUTPUT_CAP = 16 * 1024
export const MODEL_TEXT_CAP = 2048
export const SKILL_TEXT_CAP = 2048

export const MAX_EVENTS = 1000
export const MAX_BYTES = 8 * 1024 * 1024

/** Rough per-value overhead (object keys, json punctuation) used by the byte counter. */
const PER_KEY_OVERHEAD = 24

export function estimateBytes(value: unknown): number {
  if (value === null || value === undefined) return 4
  if (typeof value === 'string') return value.length * 2
  if (typeof value === 'number') return 8
  if (typeof value === 'boolean') return 4
  if (Array.isArray(value)) {
    let total = 16
    for (let i = 0; i < value.length && i < ARRAY_CAP; i++) total += estimateBytes(value[i])
    return total
  }
  if (typeof value === 'object') {
    let total = 16
    let keys = 0
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (keys++ >= MAX_KEYS) break
      total += key.length * 2 + PER_KEY_OVERHEAD + estimateBytes(entry)
    }
    return total
  }
  return 8
}