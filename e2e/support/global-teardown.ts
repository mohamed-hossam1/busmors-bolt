import { existsSync, rmSync } from 'node:fs'
import { cleanupAccounts } from './database'
import { readRuntime, runtimePath } from './runtime'

export default async function globalTeardown() {
  // E2E_KEEP_DATA=1 leaves the run's accounts and tasks for post-mortem inspection.
  if (process.env.E2E_KEEP_DATA === '1') return
  const ids = readRuntime().accounts.map(account => account.id).filter(id => /^[0-9a-f-]{36}$/i.test(id))
  cleanupAccounts(ids)
  if (existsSync(runtimePath)) rmSync(runtimePath)
}
