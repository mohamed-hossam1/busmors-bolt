import { assertSafeEnvironment } from './env'
import { cleanupAccounts, verifyRequiredSchema } from './database'
import { createAccount } from './accounts'
import { readRuntime, resetRuntime } from './runtime'

export default async function globalSetup() {
  assertSafeEnvironment()
  const staleIds = readRuntime().accounts.map(account => account.id).filter(id => /^[0-9a-f-]{36}$/i.test(id))
  cleanupAccounts(staleIds)
  resetRuntime()
  verifyRequiredSchema()
  await createAccount('primary', true)
  await createAccount('intruder', true)
  // Research consumes the shared free-tier allowance, so each research scenario gets its own workspace.
  await createAccount('research_a', true)
  await createAccount('research_b', true)
}
