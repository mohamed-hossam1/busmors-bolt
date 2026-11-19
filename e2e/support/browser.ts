import { expect, type Page } from 'playwright/test'
import type { TestAccountRecord } from './runtime'

export async function waitForHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => {
    return [...document.querySelectorAll('button,input,textarea,select,a,form')]
      .some(element => Object.keys(element).some(key => key.startsWith('__reactProps$')))
  })
}

export async function signIn(page: Page, account: TestAccountRecord) {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/signin(?:\?|$)/, { timeout: 30_000 })
  await waitForHydration(page)
}

export async function registerThroughUi(page: Page, email: string, password: string) {
  await page.goto('/signup', { waitUntil: 'domcontentloaded' })
  await waitForHydration(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 })
  await waitForHydration(page)
}
