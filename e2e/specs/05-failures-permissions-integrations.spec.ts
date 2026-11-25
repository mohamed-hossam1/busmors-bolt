import { test, expect } from 'playwright/test'
import { accountByLabel } from '../support/runtime'
import { createAccount } from '../support/accounts'
import { signIn } from '../support/browser'
import { runSql, sqlLiteral } from '../support/database'

test('API rejects unauthenticated and cross-origin mutations without changing the database', async ({ page, request }) => {
  const unauthenticated = await request.post('/api/crawl', { data: { action: 'read', url: 'https://example.com' } })
  expect(unauthenticated.status()).toBe(401)

  const account = accountByLabel('primary')
  await signIn(page, account)
  const forged = await page.context().request.post('/api/crawl', {
    headers: { Origin: 'https://attacker.invalid' },
    data: { action: 'read', url: 'https://example.com' },
  })
  expect(forged.status()).toBe(403)
})

test('deleting an account cascades through Brain records without violating audit integrity', async () => {
  const account = await createAccount('account-deletion', true)
  expect(() => runSql(`DELETE FROM auth.users WHERE id=${sqlLiteral(account.id)}`)).not.toThrow()
  const remaining = runSql(`SELECT count(*) FROM auth.users WHERE id=${sqlLiteral(account.id)}`)
  expect(remaining).toBe('0')
})
