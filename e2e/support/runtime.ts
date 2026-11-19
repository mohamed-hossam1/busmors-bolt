import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface TestAccountRecord { label: string; id: string; email: string; password: string }
interface RuntimeState { accounts: TestAccountRecord[] }

export const runtimePath = resolve('.e2e-runtime/state.json')

export function readRuntime(): RuntimeState {
  if (!existsSync(runtimePath)) return { accounts: [] }
  return JSON.parse(readFileSync(runtimePath, 'utf8')) as RuntimeState
}

export function resetRuntime() {
  mkdirSync(dirname(runtimePath), { recursive: true })
  writeFileSync(runtimePath, JSON.stringify({ accounts: [] }, null, 2))
}

export function registerAccount(account: TestAccountRecord) {
  const state = readRuntime()
  if (!state.accounts.some(item => item.id === account.id)) state.accounts.push(account)
  mkdirSync(dirname(runtimePath), { recursive: true })
  writeFileSync(runtimePath, JSON.stringify(state, null, 2))
}

export function accountByLabel(label: string): TestAccountRecord {
  const account = readRuntime().accounts.find(item => item.label === label)
  if (!account) throw new Error(`Missing E2E account ${label}`)
  return account
}
