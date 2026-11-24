import { test, expect } from 'playwright/test'
import { accountByLabel } from '../support/runtime'
import { signInClient } from '../support/accounts'
import { signIn } from '../support/browser'
import { waitForAgentReply } from '../support/tasks'

const primary = () => accountByLabel('primary')

test.beforeEach(async ({ page }) => {
  await signIn(page, primary())
  await page.goto('/employee')
})

test('orchestrator answers a simple grounded query directly', async ({ page }) => {
  const client = await signInClient(primary())
  const request = `In one sentence, what service does Orbit Ceramic Repairs offer? Request ${crypto.randomUUID()}.`
  await page.getByLabel('Message your Marketing Director').fill(request)
  await page.getByRole('button', { name: 'Send message' }).click()

  const reply = await waitForAgentReply(client, primary().id)
  expect(reply.content.toLowerCase()).toMatch(/orbit|ceramic|kintsugi|repair/)

  // Direct answers are not tasks; the retired execution path must stay unused.
  const tasks = await client.from('tasks').select('id').eq('user_request', request).limit(1)
  expect(tasks.error).toBeNull()
  expect(tasks.data).toHaveLength(0)
})

test('research and content requests get an honest unavailability response, not a task', async ({ page }) => {
  const client = await signInClient(primary())
  const request = `Write exactly 2 social posts about Kintsugi restoration. Request ${crypto.randomUUID()}.`
  await page.getByLabel('Message your Marketing Director').fill(request)
  await page.getByRole('button', { name: 'Send message' }).click()

  const reply = await waitForAgentReply(client, primary().id)
  expect(reply.content.toLowerCase()).toMatch(/temporarily unavailable|being rebuilt/)

  const tasks = await client.from('tasks').select('id').eq('user_request', request).limit(1)
  expect(tasks.data).toHaveLength(0)
})

test('direct task submit is rejected with 409 and creates no task', async ({ page }) => {
  const client = await signInClient(primary())
  const before = await client.from('tasks').select('id', { count: 'exact', head: true })
  const response = await page.request.post('/api/tasks', {
    data: {
      action: 'submit',
      request: `Forged direct submit ${crypto.randomUUID()}`,
      conversationId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
    },
  })
  expect(response.status()).toBe(409)
  expect((await response.json()).code).toBe('TASK_EXECUTION_UNAVAILABLE')

  const after = await client.from('tasks').select('id', { count: 'exact', head: true })
  expect(after.count).toBe(before.count)
})