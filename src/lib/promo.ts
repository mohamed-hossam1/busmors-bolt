export const PROMO_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export const PROMO_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{3,63}$/
export const PROMO_PREFIX_RE = /^[A-Z0-9][A-Z0-9_-]{0,19}$/

export function normalizePromoCodeInput(value: string): string {
  return value.trim().toUpperCase()
}

export function normalizePromoPrefix(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidPromoCode(code: string): boolean {
  return PROMO_CODE_RE.test(code)
}

export function formatRandomPromoCode(prefix: string, nextInt: (max: number) => number): string {
  const segment = () => {
    let out = ''
    for (let i = 0; i < 4; i++) out += PROMO_ALPHABET[nextInt(PROMO_ALPHABET.length)]
    return out
  }
  return `${prefix}-${segment()}-${segment()}`
}

export function buildSignupUrl(origin: string, locale: 'ar' | 'en', code: string): string {
  return `${origin.replace(/\/+$/, '')}/${locale}/signup?promo=${encodeURIComponent(code)}`
}

export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"'
  return value
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function buildPromosCsv(
  rows: Array<{
    code: string
    status: string
    signupUrl: string
    heavyTasksLimit: number
    heavyTasksUsed: number
    redeemedEmail: string | null
    phoneNumber: string | null
    batchLabel: string | null
    note: string | null
    expiresAt: string | null
    createdAt: string
  }>,
): string {
  const header = 'code,status,signup_url,heavy_tasks_limit,heavy_tasks_used,redeemed_email,phone_number,batch_label,note,expires_at,created_at'
  const lines = rows.map((row) =>
    [
      row.code,
      row.status,
      row.signupUrl,
      String(row.heavyTasksLimit),
      String(row.heavyTasksUsed),
      row.redeemedEmail ?? '',
      row.phoneNumber ?? '',
      row.batchLabel ?? '',
      row.note ?? '',
      row.expiresAt ?? '',
      row.createdAt,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header, ...lines].join('\n')
}