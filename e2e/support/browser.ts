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

export const PROMO_LABEL = /invite code|كود الدعوة/i
export const PHONE_LABEL = /phone|رقم الهاتف/i
export const GOOGLE_BUTTON_LABEL = /continue with google|كمّل بحساب google/i

export async function registerThroughUi(page: Page, opts: { email: string; password: string; phone: string; promoCode: string; viaQrUrl?: boolean }) {
  if (opts.viaQrUrl) {
    await page.goto(`/signup?promo=${encodeURIComponent(opts.promoCode)}`, { waitUntil: 'domcontentloaded' })
    await waitForHydration(page)
    // QR URL must genuinely auto-fill the invite code; do not re-type it below.
    await expect(page.getByLabel(PROMO_LABEL)).toHaveValue(opts.promoCode, { timeout: 15_000 })
  } else {
    await page.goto('/signup', { waitUntil: 'domcontentloaded' })
    await waitForHydration(page)
    await page.getByLabel(PROMO_LABEL).fill(opts.promoCode)
  }
  await page.getByLabel('Email').fill(opts.email)
  await page.getByLabel(PHONE_LABEL).fill(opts.phone)
  await page.getByLabel('Password').fill(opts.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 })
  await waitForHydration(page)
}