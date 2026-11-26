import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldRedirectOAuthCode } from '../../src/lib/authRouting'

describe('shouldRedirectOAuthCode', () => {
  it('does not redirect auth routes with a code (no locale prefix)', () => {
    assert.equal(shouldRedirectOAuthCode('/signup', true), false)
    assert.equal(shouldRedirectOAuthCode('/signin', true), false)
    assert.equal(shouldRedirectOAuthCode('/reset', true), false)
  })

  it('does not redirect auth routes with a code (locale prefix)', () => {
    assert.equal(shouldRedirectOAuthCode('/ar/signup', true), false)
    assert.equal(shouldRedirectOAuthCode('/en/signup', true), false)
    assert.equal(shouldRedirectOAuthCode('/ar/signin', true), false)
    assert.equal(shouldRedirectOAuthCode('/en/reset', true), false)
  })

  it('redirects non-auth pages carrying a code (no locale prefix)', () => {
    assert.equal(shouldRedirectOAuthCode('/', true), true)
    assert.equal(shouldRedirectOAuthCode('/employee', true), true)
  })

  it('redirects non-auth pages carrying a code (locale prefix)', () => {
    assert.equal(shouldRedirectOAuthCode('/ar', true), true)
    assert.equal(shouldRedirectOAuthCode('/en', true), true)
    assert.equal(shouldRedirectOAuthCode('/ar/employee', true), true)
  })

  it('never redirects the auth callback itself', () => {
    assert.equal(shouldRedirectOAuthCode('/auth/callback', true), false)
  })

  it('never redirects when there is no code', () => {
    assert.equal(shouldRedirectOAuthCode('/', false), false)
    assert.equal(shouldRedirectOAuthCode('/employee', false), false)
  })
})