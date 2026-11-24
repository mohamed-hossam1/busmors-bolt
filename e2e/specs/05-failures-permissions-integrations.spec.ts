import { test, expect } from 'playwright/test'
import { accountByLabel } from '../support/runtime'
import { createAccount, signInClient } from '../support/accounts'
import { signIn } from '../support/browser'
import { runSql, sqlLiteral } from '../support/database'

test('direct task enqueue is denied to authenticated clients and writes nothing', async () => {
  const account = accountByLabel('primary')
  const client = await signInClient(account)
  const conversation = await client.from('conversations').insert({ workspace_id: account.id, title: 'Enqueue guard E2E' }).select().single()
  expect(conversation.error).toBeNull()
  const request = `Denied enqueue E2E ${crypto.randomUUID()}`
  const origin = { kind: 'direct', conversationId: conversation.data.id }
  const before = await client.from('tasks').select('*', { count: 'exact', head: true })

  const denied = await client.rpc('enqueue_task', {
    p_conversation_id: conversation.data.id,
    p_request: request,
    p_origin: origin,
    p_idempotency_key: crypto.randomUUID(),
  })
  expect(denied.error).toBeTruthy()
  expect(denied.error?.code).toBe('42501')

  const after = await client.from('tasks').select('*', { count: 'exact', head: true })
  const messages = await client.from('messages').select('*').eq('conversation_id', conversation.data.id).eq('role', 'user')
  expect(after.count).toBe(before.count)
  expect(messages.data).toHaveLength(0)
})

test('API rejects unauthenticated and cross-origin mutations without changing the database', async ({ page, request }) => {
  const unauthenticated = await request.post('/api/tasks', { data: { action: 'refresh' } })
  expect(unauthenticated.status()).toBe(401)

  const account = accountByLabel('primary')
  const client = await signInClient(account)
  const before = await client.from('tasks').select('*', { count: 'exact', head: true })
  await signIn(page, account)
  const forged = await page.context().request.post('/api/tasks', { headers: { Origin: 'https://attacker.invalid' }, data: { action: 'submit', request: 'forged', conversationId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID() } })
  expect(forged.status()).toBe(403)
  const after = await client.from('tasks').select('*', { count: 'exact', head: true })
  expect(after.count).toBe(before.count)
})

test('database constraints reject cross-workspace task origins without partial writes', async () => {
  const primary = accountByLabel('primary')
  const intruder = accountByLabel('intruder')
  const primaryClient = await signInClient(primary)
  const intruderClient = await signInClient(intruder)
  const foreignConversation = await primaryClient.from('conversations').insert({ workspace_id: primary.id, title: 'Owner only' }).select().single()
  expect(foreignConversation.error).toBeNull()
  const before = await intruderClient.from('tasks').select('*', { count: 'exact', head: true })
  const forged = await intruderClient.rpc('enqueue_task', {
    p_conversation_id: foreignConversation.data.id,
    p_request: 'Cross tenant request',
    p_origin: { kind: 'direct', conversationId: foreignConversation.data.id },
    p_idempotency_key: crypto.randomUUID(),
  })
  expect(forged.error).toBeTruthy()
  expect(forged.error?.code).toBe('42501')
  const after = await intruderClient.from('tasks').select('*', { count: 'exact', head: true })
  expect(after.count).toBe(before.count)
})

test('deleting an account cascades through Brain records without violating audit integrity', async () => {
  const account = await createAccount('account-deletion', true)
  expect(() => runSql(`DELETE FROM auth.users WHERE id=${sqlLiteral(account.id)}`)).not.toThrow()
  const remaining = runSql(`SELECT count(*) FROM auth.users WHERE id=${sqlLiteral(account.id)}`)
  expect(remaining).toBe('0')
})
