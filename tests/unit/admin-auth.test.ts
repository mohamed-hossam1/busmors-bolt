import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkIsAdminUser, isAdminUser } from '../../src/server/admin/admin-identity'

const ENV = { ADMIN_USER_ID: 'admin-1', ADMIN_EMAIL: 'boss@busmora.ai' } as unknown as NodeJS.ProcessEnv

describe('isAdminUser (pure allow-list check)', () => {
  it('accepts a session user whose id is allow-listed', () => {
    assert.equal(isAdminUser({ id: 'admin-1' }, ENV), true)
  })

  it('accepts a session user whose email is allow-listed', () => {
    assert.equal(isAdminUser({ id: 'user-9', email: 'BOSS@busmora.ai' }, ENV), true)
  })

  it('rejects a non-admin user', () => {
    assert.equal(isAdminUser({ id: 'user-9', email: 'user@busmora.ai' }, ENV), false)
  })

  it('fails closed when no operator is configured', () => {
    assert.equal(isAdminUser({ id: 'admin-1' }, {} as unknown as NodeJS.ProcessEnv), false)
  })
})

describe('checkIsAdminUser (session-derived identity)', () => {
  it('returns the session for an authenticated admin', async () => {
    const session = await checkIsAdminUser(async () => ({ user: { id: 'admin-1' } }), ENV)
    assert.ok(session)
    assert.equal(session?.user.id, 'admin-1')
  })

  it('rejects an unauthenticated request', async () => {
    const session = await checkIsAdminUser(async () => null, ENV)
    assert.equal(session, null)
  })

  it('rejects a non-admin session even when forged id/email are supplied as extra args', async () => {
    // The resolver is the only source of identity; forged caller-supplied
    // credentials passed as additional arguments must be ignored.
    const forged = { id: 'admin-1', email: 'boss@busmora.ai' }
    const session = await (checkIsAdminUser as unknown as (...args: unknown[]) => Promise<unknown>)(
      async () => ({ user: { id: 'attacker', email: 'attacker@evil.test' } }),
      ENV,
      forged,
    )
    assert.equal(session, null)
  })

  it('rejects when the session resolver throws', async () => {
    const session = await checkIsAdminUser(async () => {
      throw new Error('no session')
    }, ENV)
    assert.equal(session, null)
  })
})