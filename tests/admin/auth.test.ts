import test from 'node:test'
import assert from 'node:assert/strict'
import { isAdminUser } from '../../src/server/admin/identity'
import { safeReturnPath } from '../../src/lib/authRouting'

test('isAdminUser correctly identifies admin by email and id', () => {
  // Set test environment variables matching .env
  process.env.ADMIN_EMAIL = 'admin@busmora.com'
  process.env.ADMIN_USER_ID = 'cecbf0ae-8e4f-4deb-97df-07c7c4b7907f'

  // Match by email
  assert.equal(isAdminUser({ id: 'any-id', email: 'admin@busmora.com' }), true)
  assert.equal(isAdminUser({ id: 'any-id', email: 'ADMIN@BUSMORA.COM' }), true)

  // Match by id
  assert.equal(isAdminUser({ id: 'cecbf0ae-8e4f-4deb-97df-07c7c4b7907f', email: 'other@busmora.com' }), true)

  // Non-admin users
  assert.equal(isAdminUser({ id: 'regular-user-id', email: 'user@example.com' }), false)
  assert.equal(isAdminUser({ id: 'random-id', email: 'admin@other.com' }), false)
  assert.equal(isAdminUser(null), false)
  assert.equal(isAdminUser(undefined), false)
})

test('safeReturnPath allows admin paths and admin trace details', () => {
  assert.equal(safeReturnPath('/admin'), '/admin')
  assert.equal(safeReturnPath('/ar/admin'), '/ar/admin')
  assert.equal(safeReturnPath('/en/admin'), '/en/admin')
  assert.equal(safeReturnPath('/admin/traces'), '/admin/traces')
  assert.equal(safeReturnPath('/ar/admin/traces/trace-123'), '/ar/admin/traces/trace-123')
  assert.equal(safeReturnPath('/employee'), '/employee')

  // Disallowed or unsafe
  assert.equal(safeReturnPath('https://evil.com/admin'), null)
  assert.equal(safeReturnPath('//evil.com/admin'), null)
  assert.equal(safeReturnPath('/admin/too/many/nested/subpaths/here'), null)
})
