import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizePromoCodeInput,
  normalizePromoPrefix,
  isValidPromoCode,
  formatRandomPromoCode,
  buildSignupUrl,
  csvCell,
  buildPromosCsv,
  PROMO_ALPHABET,
  PROMO_CODE_RE,
  PROMO_PREFIX_RE,
} from '../../src/lib/promo'
import { isSameOriginRequest, safeReturnPath } from '../../src/lib/authRouting'

describe('normalizePromoCodeInput', () => {
  it('trims and uppercases', () => {
    assert.equal(normalizePromoCodeInput('  busm-abcd-efgh  '), 'BUSM-ABCD-EFGH')
  })
})

describe('normalizePromoPrefix', () => {
  it('trims and uppercases', () => {
    assert.equal(normalizePromoPrefix('  busm '), 'BUSM')
  })
})

describe('isValidPromoCode', () => {
  it('accepts a valid code', () => {
    assert.equal(isValidPromoCode('BUSM-ABCD-EFGH'), true)
  })

  it('rejects too-short codes', () => {
    assert.equal(isValidPromoCode('AB'), false)
  })

  it('rejects lowercase codes', () => {
    assert.equal(isValidPromoCode('busm-abcd-efgh'), false)
  })

  it('rejects invalid characters', () => {
    assert.equal(isValidPromoCode('BUSM-ABCD-EFG!'), false)
  })
})

describe('formatRandomPromoCode', () => {
  it('uses the alphabet via nextInt', () => {
    const code = formatRandomPromoCode('BUSM', () => 0)
    assert.equal(PROMO_ALPHABET[0], '2')
    assert.equal(code, 'BUSM-2222-2222')
  })

  it('cycles through the alphabet', () => {
    let i = 0
    const code = formatRandomPromoCode('BUSM', () => {
      const value = i % PROMO_ALPHABET.length
      i++
      return value
    })
    assert.equal(code, `BUSM-${PROMO_ALPHABET[0]}${PROMO_ALPHABET[1]}${PROMO_ALPHABET[2]}${PROMO_ALPHABET[3]}-${PROMO_ALPHABET[4]}${PROMO_ALPHABET[5]}${PROMO_ALPHABET[6]}${PROMO_ALPHABET[7]}`)
  })
})

describe('buildSignupUrl', () => {
  it('trims trailing slash and encodes the code', () => {
    assert.equal(buildSignupUrl('https://busmora.com/', 'ar', 'BUSM ABCD'), 'https://busmora.com/ar/signup?promo=BUSM%20ABCD')
  })
})

describe('csvCell', () => {
  it('quotes fields with comma, quote, or newline', () => {
    assert.equal(csvCell('a,b'), '"a,b"')
    assert.equal(csvCell('say "hi"'), '"say ""hi"""')
    assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
  })

  it('leaves a leading + phone number untouched', () => {
    assert.equal(csvCell('+201012345678'), '+201012345678')
  })
})

describe('buildPromosCsv', () => {
  it('writes header and row with nulls as empty', () => {
    const csv = buildPromosCsv([
      {
        code: 'BUSM-ABCD-EFGH',
        status: 'active',
        signupUrl: 'https://busmora.com/ar/signup?promo=BUSM-ABCD-EFGH',
        heavyTasksLimit: 6,
        heavyTasksUsed: 0,
        redeemedEmail: null,
        phoneNumber: null,
        batchLabel: null,
        note: null,
        expiresAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const lines = csv.split('\n')
    assert.equal(
      lines[0],
      'code,status,signup_url,heavy_tasks_limit,heavy_tasks_used,redeemed_email,phone_number,batch_label,note,expires_at,created_at',
    )
    assert.equal(lines[1], 'BUSM-ABCD-EFGH,active,https://busmora.com/ar/signup?promo=BUSM-ABCD-EFGH,6,0,,,,,,2026-01-01T00:00:00.000Z')
  })
})

describe('isSameOriginRequest', () => {
  it('returns true for GET', () => {
    assert.equal(isSameOriginRequest(new Request('http://localhost/api', { method: 'GET' })), true)
  })

  it('returns true for matching host POST', () => {
    const req = new Request('http://localhost/api', { method: 'POST', headers: { origin: 'http://localhost' } })
    assert.equal(isSameOriginRequest(req), true)
  })

  it('returns false for mismatched origin POST', () => {
    const req = new Request('http://localhost/api', { method: 'POST', headers: { origin: 'http://evil.com' } })
    assert.equal(isSameOriginRequest(req), false)
  })

  it('returns false for malformed origin POST', () => {
    const req = new Request('http://localhost/api', { method: 'POST', headers: { origin: 'not a url' } })
    assert.equal(isSameOriginRequest(req), false)
  })

  it('returns true when origin is missing', () => {
    const req = new Request('http://localhost/api', { method: 'POST' })
    assert.equal(isSameOriginRequest(req), true)
  })

  it('uses the first comma-separated x-forwarded-host', () => {
    const req = new Request('http://localhost/api', {
      method: 'POST',
      headers: { origin: 'https://app.busmora.com', 'x-forwarded-host': 'app.busmora.com, internal-proxy' },
    })
    assert.equal(isSameOriginRequest(req), true)
  })

  it('rejects when the first comma-separated x-forwarded-host does not match origin', () => {
    const req = new Request('http://localhost/api', {
      method: 'POST',
      headers: { origin: 'https://evil.com', 'x-forwarded-host': 'app.busmora.com, internal-proxy' },
    })
    assert.equal(isSameOriginRequest(req), false)
  })
})

describe('safeReturnPath', () => {
  it('allows /admin', () => {
    assert.equal(safeReturnPath('/admin'), '/admin')
  })

  it('allows /admin/promos', () => {
    assert.equal(safeReturnPath('/admin/promos'), '/admin/promos')
  })

  it('allows locale-prefixed /ar/admin/promos', () => {
    assert.equal(safeReturnPath('/ar/admin/promos'), '/ar/admin/promos')
  })

  it('allows /admin/traces/abc', () => {
    assert.equal(safeReturnPath('/admin/traces/abc'), '/admin/traces/abc')
  })

  it('rejects protocol-relative //evil.com', () => {
    assert.equal(safeReturnPath('//evil.com'), null)
  })

  it('rejects /admin/a/b/c (too deep)', () => {
    assert.equal(safeReturnPath('/admin/a/b/c'), null)
  })

  it('still allows /employee', () => {
    assert.equal(safeReturnPath('/employee'), '/employee')
  })

  it('still allows /app/calendar', () => {
    assert.equal(safeReturnPath('/app/calendar'), '/app/calendar')
  })
})

describe('normalizePromoCodeInput (extended)', () => {
  it('is idempotent on already-normalized input', () => {
    assert.equal(normalizePromoCodeInput('BUSM-ABCD-EFGH'), 'BUSM-ABCD-EFGH')
  })

  it('maps empty string to empty string', () => {
    assert.equal(normalizePromoCodeInput(''), '')
  })

  it('maps whitespace-only input to empty string', () => {
    assert.equal(normalizePromoCodeInput('   '), '')
  })
})

describe('normalizePromoPrefix (extended)', () => {
  it('is idempotent on already-normalized input', () => {
    assert.equal(normalizePromoPrefix('BUSM'), 'BUSM')
  })

  it('maps empty string to empty string', () => {
    assert.equal(normalizePromoPrefix(''), '')
  })
})

describe('isValidPromoCode (boundaries)', () => {
  it('accepts a 4-char code', () => {
    assert.equal(isValidPromoCode('ABCD'), true)
  })

  it('accepts a 64-char code', () => {
    assert.equal(isValidPromoCode('A'.repeat(64)), true)
  })

  it('rejects a 65-char code', () => {
    assert.equal(isValidPromoCode('A'.repeat(65)), false)
  })

  it('rejects a code starting with a hyphen', () => {
    assert.equal(isValidPromoCode('-ABC'), false)
  })

  it('rejects a 3-char code', () => {
    assert.equal(isValidPromoCode('ABC'), false)
  })
})

describe('PROMO_CODE_RE and PROMO_PREFIX_RE', () => {
  it('accepts a prefix of length 20', () => {
    assert.equal(PROMO_PREFIX_RE.test('A'.repeat(20)), true)
  })

  it('rejects a prefix of length 21', () => {
    assert.equal(PROMO_PREFIX_RE.test('A'.repeat(21)), false)
  })

  it('accepts a code containing an underscore', () => {
    assert.equal(PROMO_CODE_RE.test('AB_CD'), true)
  })
})

describe('formatRandomPromoCode (last alphabet char)', () => {
  it('uses the last alphabet char and keeps two 4-char segments', () => {
    const last = PROMO_ALPHABET[PROMO_ALPHABET.length - 1]
    const code = formatRandomPromoCode('SALE', () => PROMO_ALPHABET.length - 1)
    const expected = `SALE-${last}${last}${last}${last}-${last}${last}${last}${last}`
    assert.equal(code, expected)
    assert.ok(code.startsWith('SALE-'))
    const parts = code.split('-')
    assert.equal(parts.length, 3)
    assert.equal(parts[0], 'SALE')
    assert.equal(parts[1].length, 4)
    assert.equal(parts[2].length, 4)
  })
})

describe('buildSignupUrl (extended)', () => {
  it('collapses multiple trailing slashes to a single slash', () => {
    assert.equal(buildSignupUrl('https://x.com///', 'en', 'ABC'), 'https://x.com/en/signup?promo=ABC')
  })

  it('percent-encodes a code containing spaces', () => {
    assert.equal(buildSignupUrl('https://x.com', 'en', 'A B'), 'https://x.com/en/signup?promo=A%20B')
  })
})

describe('csvCell (extended)', () => {
  it('leaves an empty string empty', () => {
    assert.equal(csvCell(''), '')
  })

  it('quotes and doubles a lone quote', () => {
    assert.equal(csvCell('"'), '""""')
  })

  it('quotes a value containing a carriage return', () => {
    assert.equal(csvCell('\r'), '"\r"')
  })
})

describe('buildPromosCsv (extended)', () => {
  it('quotes comma/newline fields but leaves a leading + phone number untouched', () => {
    const csv = buildPromosCsv([
      {
        code: 'BUSM-ABCD-EFGH',
        status: 'active',
        signupUrl: 'https://busmora.com/en/signup?promo=BUSM-ABCD-EFGH',
        heavyTasksLimit: 6,
        heavyTasksUsed: 2,
        redeemedEmail: 'user@example.com',
        phoneNumber: '+201012345678',
        batchLabel: 'Batch, One',
        note: 'line1\nline2',
        expiresAt: '2026-02-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    const header =
      'code,status,signup_url,heavy_tasks_limit,heavy_tasks_used,redeemed_email,phone_number,batch_label,note,expires_at,created_at'
    const expectedRow =
      'BUSM-ABCD-EFGH,active,https://busmora.com/en/signup?promo=BUSM-ABCD-EFGH,6,2,user@example.com,+201012345678,"Batch, One","line1\nline2",2026-02-01T00:00:00.000Z,2026-01-01T00:00:00.000Z'
    assert.equal(csv.split('\n')[0], header)
    assert.ok(csv.includes(',+201012345678,'))
    assert.ok(!csv.includes('"+201012345678"'))
    assert.ok(csv.includes('"Batch, One"'))
    assert.ok(csv.includes('"line1\nline2"'))
    assert.equal(csv, [header, expectedRow].join('\n'))
  })

  it('emits header plus one line per row', () => {
    const rows = [1, 2, 3].map((n) => ({
      code: `BUSM-ABCD-EFG${n}`,
      status: 'active',
      signupUrl: `https://busmora.com/en/signup?promo=BUSM-ABCD-EFG${n}`,
      heavyTasksLimit: 6,
      heavyTasksUsed: 0,
      redeemedEmail: null,
      phoneNumber: null,
      batchLabel: null,
      note: null,
      expiresAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    }))
    const csv = buildPromosCsv(rows)
    assert.equal(csv.split('\n').length, 1 + rows.length)
  })
})