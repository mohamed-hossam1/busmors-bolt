const EGYPT_MOBILE = /^\+201[0125]\d{8}$/
const E164 = /^\+[1-9]\d{7,14}$/
const EGYPT_LOCAL = /^01[0125]\d{8}$/
const EGYPT_INTL = /^201[0125]\d{8}$/

function toAsciiDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (ch) => String(ch.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
}

function clean(value: string): { plus: boolean; digits: string; valid: boolean } {
  let plus = false
  let digits = ''
  let valid = true
  for (const ch of value) {
    if (ch >= '0' && ch <= '9') {
      digits += ch
    } else if (ch === '+' && !plus && digits.length === 0) {
      plus = true
    } else if (ch === '-' || ch === '(' || ch === ')' || ch === '.' || /\s/.test(ch)) {
      // allowed formatting characters
    } else {
      valid = false
    }
  }
  return { plus, digits, valid }
}

export function normalizePhone(
  raw: string,
): { ok: true; normalized: string } | { ok: false; errorCode: 'REQUIRED' | 'INVALID_PHONE' } {
  const input = String(raw ?? '')
  if (input.trim() === '') {
    return { ok: false, errorCode: 'REQUIRED' }
  }

  const { plus, digits, valid } = clean(toAsciiDigits(input))
  if (!valid || digits.length === 0) {
    return { ok: false, errorCode: 'INVALID_PHONE' }
  }

  let candidate: string
  if (plus) {
    candidate = `+${digits}`
  } else if (digits.startsWith('00')) {
    candidate = `+${digits.slice(2)}`
  } else if (EGYPT_LOCAL.test(digits)) {
    candidate = `+20${digits.slice(1)}`
  } else if (EGYPT_INTL.test(digits)) {
    candidate = `+${digits}`
  } else {
    return { ok: false, errorCode: 'INVALID_PHONE' }
  }

  if (candidate.startsWith('+20')) {
    if (!EGYPT_MOBILE.test(candidate)) {
      return { ok: false, errorCode: 'INVALID_PHONE' }
    }
  } else if (!E164.test(candidate)) {
    return { ok: false, errorCode: 'INVALID_PHONE' }
  }

  return { ok: true, normalized: candidate }
}