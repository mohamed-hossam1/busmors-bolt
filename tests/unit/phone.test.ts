import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizePhone } from '../../src/lib/phone'

describe('normalizePhone', () => {
  it('normalizes Egyptian 010, 011, 012 and 015 prefixes to +20', () => {
    assert.deepEqual(normalizePhone('01012345678'), { ok: true, normalized: '+201012345678' })
    assert.deepEqual(normalizePhone('01112345678'), { ok: true, normalized: '+201112345678' })
    assert.deepEqual(normalizePhone('01212345678'), { ok: true, normalized: '+201212345678' })
    assert.deepEqual(normalizePhone('01512345678'), { ok: true, normalized: '+201512345678' })
  })

  it('normalizes +20, 0020 and 201 forms to the same +201 number', () => {
    assert.deepEqual(normalizePhone('+201012345678'), { ok: true, normalized: '+201012345678' })
    assert.deepEqual(normalizePhone('00201012345678'), { ok: true, normalized: '+201012345678' })
    assert.deepEqual(normalizePhone('201012345678'), { ok: true, normalized: '+201012345678' })
  })

  it('converts Arabic-Indic digits to ASCII', () => {
    assert.deepEqual(normalizePhone('٠١٠١٢٣٤٥٦٧٨'), { ok: true, normalized: '+201012345678' })
  })

  it('converts Eastern Arabic / Persian digits to ASCII', () => {
    assert.deepEqual(normalizePhone('۰۱۲۱۲۳۴۵۶۷۸'), { ok: true, normalized: '+201212345678' })
  })

  it('strips formatting characters', () => {
    assert.deepEqual(normalizePhone('(010) 1234-5678'), { ok: true, normalized: '+201012345678' })
  })

  it('accepts a valid international E.164 number unchanged', () => {
    assert.deepEqual(normalizePhone('+971501234567'), { ok: true, normalized: '+971501234567' })
  })

  it('rejects an empty string as REQUIRED', () => {
    assert.deepEqual(normalizePhone(''), { ok: false, errorCode: 'REQUIRED' })
    assert.deepEqual(normalizePhone('   '), { ok: false, errorCode: 'REQUIRED' })
  })

  it('rejects too-short Egyptian digits as INVALID_PHONE', () => {
    assert.deepEqual(normalizePhone('010123'), { ok: false, errorCode: 'INVALID_PHONE' })
  })

  it('rejects a bad Egyptian prefix as INVALID_PHONE', () => {
    assert.deepEqual(normalizePhone('01912345678'), { ok: false, errorCode: 'INVALID_PHONE' })
  })

  it('rejects letters as INVALID_PHONE', () => {
    assert.deepEqual(normalizePhone('abc-def'), { ok: false, errorCode: 'INVALID_PHONE' })
  })

  it('rejects digits mixed with trailing letters as INVALID_PHONE', () => {
    assert.deepEqual(normalizePhone('01012345678abc'), { ok: false, errorCode: 'INVALID_PHONE' })
  })

  it('rejects +200 and malformed +20 numbers', () => {
    assert.deepEqual(normalizePhone('+2001234567890'), { ok: false, errorCode: 'INVALID_PHONE' })
    assert.deepEqual(normalizePhone('+2012345'), { ok: false, errorCode: 'INVALID_PHONE' })
  })
})