import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MARKETING_RESEARCH_INTENT, isResearchMode, parseResearchRequest, queryLanguageOrder, addUsage, emptyUsage, isUsageWithin } from '../../src/features/research/contracts'
import { BUDGET_PROFILES, COMPOSIO_ALLOWED_ACTIONS, COMPOSIO_BLOCKED_ACTIONS, SYSTEM_RULES, assertComposioAction, assertFreeTierOnly, assertSystemRule, budgetFor, capsForRun, isComposioActionAllowed, PolicyViolation } from '../../src/features/research/policy'

test('contracts: single marketing_research intent with a mode', () => {
  assert.equal(MARKETING_RESEARCH_INTENT, 'marketing_research')
  assert.equal(isResearchMode('quick'), true)
  assert.equal(isResearchMode('turbo'), false)
  assert.equal(parseResearchRequest({ intent: 'marketing_research', mode: 'deep', request: 'x', conversationId: 'c' })?.mode, 'deep')
  assert.equal(parseResearchRequest({ intent: 'market_research', mode: 'deep', request: 'x', conversationId: 'c' }), null)
})

test('contracts: Arabic and Arabizi queries lead with Arabic', () => {
  assert.deepEqual(queryLanguageOrder('ceramic repair في القاهرة'), ['ar-EG', 'en'])
  assert.deepEqual(queryLanguageOrder('tsle7 sramic fi el cairo'), ['ar-EG', 'en'])
  assert.deepEqual(queryLanguageOrder('ceramic repair'), ['en', 'ar-EG'])
})

test('contracts: usage arithmetic is additive and bounded', () => {
  const usage = addUsage(emptyUsage(), { calls: 2, credits: 1 })
  assert.equal(usage.calls, 2)
  assert.equal(isUsageWithin({ calls: 8, pages: 4, tokens: 0, credits: 0 }, BUDGET_PROFILES.quick), true)
  assert.equal(isUsageWithin({ calls: 9, pages: 4, tokens: 0, credits: 0 }, BUDGET_PROFILES.quick), false)
})

test('policy: FREE_TIER_ONLY is immutable and cannot be overridden by a request', () => {
  assert.equal(SYSTEM_RULES.freeTierOnly, true)
  assert.ok(Object.isFrozen(SYSTEM_RULES))
  assert.equal(budgetFor('standard').calls, BUDGET_PROFILES.standard.calls)
  assert.doesNotThrow(() => assertSystemRule('freeTierOnly'))
  assert.throws(() => assertFreeTierOnly({ paidFallback: true }), /cannot override FREE_TIER_ONLY/)
  assert.throws(() => assertFreeTierOnly({ autoTopUp: true }), /cannot override FREE_TIER_ONLY/)
  assert.doesNotThrow(() => assertFreeTierOnly({ credits: 'free' }))
})

test('policy: Composio is allowlist-only and PII actions are unreachable', () => {
  assert.equal(isComposioActionAllowed('facebook', 'comments_list'), true)
  assert.equal(isComposioActionAllowed('facebook', 'profiles_get'), true)
  assert.equal(isComposioActionAllowed('reddit', 'creator_email'), false)
  assert.equal(isComposioActionAllowed('instagram', 'audience_demographics'), false)
  assert.throws(() => assertComposioAction('instagram', 'age_gender'), PolicyViolation)
  assert.ok(COMPOSIO_BLOCKED_ACTIONS.includes('email_lookup'))
  assert.ok(!COMPOSIO_ALLOWED_ACTIONS.facebook.includes('creator_email'))
  const caps = capsForRun()
  assert.ok(caps.posts <= 30 && caps.profiles <= 12)
})