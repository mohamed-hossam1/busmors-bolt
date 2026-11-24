import { test } from 'node:test'
import assert from 'node:assert/strict'

import { chooseAccountOutcome, adsRedirectPath } from '../../src/features/meta-ads/account-choice'
import type { AdAccount } from '../../src/features/meta-ads/contracts'

const activeA: AdAccount = { id: 'act_1', name: 'Alpha', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true }
const activeB: AdAccount = { id: 'act_2', name: 'Zed', currency: 'EGP', timezoneName: 'Africa/Cairo', active: true }
const inactiveB: AdAccount = { id: 'act_3', name: 'Beta', currency: 'EGP', timezoneName: 'Africa/Cairo', active: false }

test('chooseAccountOutcome returns none for an empty list', () => {
  assert.deepEqual(chooseAccountOutcome([]), { kind: 'none' })
})

test('chooseAccountOutcome returns none when the only account is inactive', () => {
  assert.deepEqual(chooseAccountOutcome([inactiveB]), { kind: 'none' })
})

test('chooseAccountOutcome auto-selects the single active account', () => {
  assert.deepEqual(chooseAccountOutcome([activeA, inactiveB]), { kind: 'auto', account: activeA })
})

test('chooseAccountOutcome keeps only active accounts sorted by name', () => {
  const outcome = chooseAccountOutcome([activeB, activeA])
  assert.equal(outcome.kind, 'choose')
  if (outcome.kind !== 'choose') return
  assert.deepEqual(outcome.accounts.map((account) => account.id), [activeA.id, activeB.id])
})

test('adsRedirectPath builds a localized path for a known locale', () => {
  assert.equal(adsRedirectPath('en', 'connected'), '/en/ads?meta=connected')
  assert.equal(adsRedirectPath('ar', 'choose_account'), '/ar/ads?meta=choose_account')
})

test('adsRedirectPath falls back to the default locale when it is missing', () => {
  assert.equal(adsRedirectPath(undefined, 'failed'), '/ar/ads?meta=failed')
})

test('adsRedirectPath falls back to the default locale for an unknown locale', () => {
  assert.equal(adsRedirectPath('fr', 'failed'), '/ar/ads?meta=failed')
})