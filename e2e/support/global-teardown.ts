import { existsSync, rmSync } from 'node:fs'
import { cleanupAccounts } from './database'
import { readRuntime, runtimePath } from './runtime'

export default async function globalTeardown() {
  const ids = readRuntime().accounts.map(account => account.id).filter(id => /^[0-9a-f-]{36}$/i.test(id))
  cleanupAccounts(ids)
  if (existsSync(runtimePath)) rmSync(runtimePath)
}
