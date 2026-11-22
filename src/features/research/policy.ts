import type { ResearchBudget, ResearchMode } from './contracts'

/**
 * Immutable system rules. They are frozen, exported as literals, and checked on
 * every request path so no agent, provider or caller can negotiate them away.
 */
export const SYSTEM_RULES = Object.freeze({
  freeTierOnly: true,
  ownerApprovalRequired: true,
  pdfValidationRequired: true,
  composioAllowlistOnly: true,
  evidenceRequiredForClaims: true,
})

export type SystemRule = keyof typeof SYSTEM_RULES

/** Typed, non-retryable policy failure. Nothing upstream may catch and continue. */
export class PolicyViolation extends Error {
  readonly code = 'policy_violation'
  readonly retryable = false
  constructor(public readonly rule: SystemRule, message: string) {
    super(message)
    this.name = 'PolicyViolation'
  }
}

export function assertSystemRule(rule: SystemRule): void {
  if (SYSTEM_RULES[rule] !== true) throw new PolicyViolation(rule, `${rule} is an immutable system rule.`)
}

/** Any attempt to opt into paid fallback, top-ups or paid tiers is refused here. */
export function assertFreeTierOnly(request: unknown): void {
  assertSystemRule('freeTierOnly')
  if (!request || typeof request !== 'object') return
  for (const key of ['paidFallback', 'allowPaid', 'paidTier', 'autoTopUp', 'billingMode', 'credits'] as const) {
    const value = (request as Record<string, unknown>)[key]
    if (value === undefined) continue
    if (key === 'credits' && (value === 'free' || value === 'free_tier')) continue
    throw new PolicyViolation('freeTierOnly', `${key} cannot override FREE_TIER_ONLY. Remove it and reduce scope instead.`)
  }
}

export interface BudgetProfile {
  calls: number
  pages: number
  tokens: number
  seconds: number
  credits: number
}

/** One shared free-tier allowance profile per research mode. */
export const BUDGET_PROFILES: Readonly<Record<ResearchMode, BudgetProfile>> = Object.freeze({
  quick: { calls: 8, pages: 4, tokens: 7000, seconds: 45, credits: 8 },
  standard: { calls: 18, pages: 10, tokens: 18000, seconds: 90, credits: 18 },
  deep: { calls: 36, pages: 26, tokens: 40000, seconds: 160, credits: 36 },
})

export function budgetFor(mode: ResearchMode): ResearchBudget {
  return { ...BUDGET_PROFILES[mode] }
}

/** Track activation matrix: only the tracks a decision needs are planned. */
export const TRACK_BUDGET_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  market_demand: 0.3,
  competitor_commercial: 0.3,
  customer_audience: 0.2,
  brand_positioning: 0.1,
  benchmark_strategy: 0.1,
})

/** The Composio code-level read allowlist. The full toolkit is never exposed. */
export const COMPOSIO_ALLOWED_ACTIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  facebook: Object.freeze(['profiles_get', 'posts_list', 'comments_list', 'ad_library_search']),
  instagram: Object.freeze(['profiles_get', 'posts_list', 'comments_list']),
  tiktok: Object.freeze(['profiles_get', 'posts_list', 'comments_list']),
  youtube: Object.freeze(['channels_get', 'videos_list', 'transcripts_get', 'comments_list']),
  reddit: Object.freeze(['profiles_get', 'posts_list', 'comments_list']),
})

/** Enrichment / PII actions can never be invoked, by an agent or a request. */
export const COMPOSIO_BLOCKED_ACTIONS: readonly string[] = Object.freeze([
  'creator_email',
  'creator_contact',
  'age_gender',
  'follower_following',
  'audience_demographics',
  'profile_enrich',
  'email_lookup',
  'phone_lookup',
])

export function isComposioActionAllowed(platform: string, action: string): boolean {
  assertSystemRule('composioAllowlistOnly')
  if (COMPOSIO_BLOCKED_ACTIONS.includes(action)) return false
  const allowed = COMPOSIO_ALLOWED_ACTIONS[platform]
  return !!allowed && allowed.includes(action)
}

export function assertComposioAction(platform: string, action: string): void {
  if (!isComposioActionAllowed(platform, action)) {
    throw new PolicyViolation('composioAllowlistOnly', `${platform}/${action} is not in the read allowlist.`)
  }
}

/** Per-run caps bounding the public sample. */
export const COMPOSIO_RUN_CAPS = Object.freeze({
  profiles: 12,
  posts: 30,
  videos: 12,
  commentPages: 4,
  commentsPerPage: 40,
  transcripts: 8,
  adResults: 20,
})

export interface RunCaps {
  profiles: number
  posts: number
  videos: number
  commentPages: number
  commentsPerPage: number
  transcripts: number
  adResults: number
}

export function capsForRun(): RunCaps {
  return { ...COMPOSIO_RUN_CAPS }
}

export function assertWithinCaps(usage: { profiles: number; posts: number; videos: number; commentPages: number; transcripts: number; adResults: number }, caps: RunCaps = capsForRun()): void {
  for (const key of ['profiles', 'posts', 'videos', 'commentPages', 'transcripts', 'adResults'] as const) {
    if (usage[key] > caps[key]) throw new PolicyViolation('composioAllowlistOnly', `Per-run cap exceeded for ${key}.`)
  }
}