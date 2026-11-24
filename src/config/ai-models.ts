/**
 * Busmora AI Model & Provider Configuration
 * Single centralized configuration for all live AI operations.
 *
 * Dual-mode architecture (AI_MODE):
 *  - 'production': full provider setup.
 *  - 'test':       SovereignEG is fully excluded, and the only permitted live
 *                  models are Groq `openai/gpt-oss-120b` and Dahl
 *                  `deepseek-ai/DeepSeek-V4-Flash-0731`. No other model or
 *                  provider may be called in test mode, including via fallback
 *                  or environment overrides.
 */

export interface ModelConfig {
  provider: 'groq' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'dahl' | 'sovereigneg' | 'custom'
  model: string
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export interface FallbackTargetConfig {
  provider: ModelConfig['provider']
  model: string
  timeoutMs?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export type AiEnvironmentMode = 'production' | 'test'

export const CURRENT_AI_MODE: AiEnvironmentMode =
  (process.env.AI_MODE as AiEnvironmentMode) ||
  (process.env.NEXT_PUBLIC_AI_MODE as AiEnvironmentMode) ||
  'production'

/**
 * Production fallback targets. Test mode never uses this template.
 */
export const PROD_AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] = [
  {
    provider: 'sovereigneg',
    model: 'gpt-oss-120b',
    timeoutMs: 20000,
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    timeoutMs: 20000,
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    timeoutMs: 15000,
  },
  {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    timeoutMs: 25000,
    reasoningEffort: 'none',
  },
] as const

/**
 * Test fallback targets. The owner-approved allowlist is exactly:
 *   Groq  openai/gpt-oss-120b
 *   Dahl  deepseek-ai/DeepSeek-V4-Flash-0731
 * No SovereignEG, no other model.
 */
export const TEST_AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] = [
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    timeoutMs: 20000,
  },
  {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    timeoutMs: 25000,
    reasoningEffort: 'none',
  },
] as const

export const AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] =
  CURRENT_AI_MODE === 'test' ? TEST_AI_FALLBACK_TEMPLATE : PROD_AI_FALLBACK_TEMPLATE

/**
 * Production model routing for live operations. The retired content, campaign,
 * diagnosis, and research operations are intentionally absent.
 */
export const PROD_AI_MODELS = {
  orchestrator: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  fastChat: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.6,
  },

  router: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  roadmap: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  onboardingCrawl: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.1,
  },
} as const satisfies Record<string, ModelConfig>

/**
 * Test model routing. Only the two owner-approved models are present.
 */
export const TEST_AI_MODELS = {
  orchestrator: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  fastChat: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.6,
  },

  router: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  roadmap: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  onboardingCrawl: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.1,
  },
} as const satisfies Record<string, ModelConfig>

export const AI_MODELS: Record<string, ModelConfig> =
  CURRENT_AI_MODE === 'test'
    ? (TEST_AI_MODELS as unknown as Record<string, ModelConfig>)
    : (PROD_AI_MODELS as unknown as Record<string, ModelConfig>)

/** Helper to get model config for a given live operation. */
export function getModelConfigForOperation(operation: string): ModelConfig {
  switch (operation) {
    case 'orchestrate':
      return AI_MODELS.orchestrator
    case 'chat':
    case 'brain_answer':
    case 'title':
      return AI_MODELS.fastChat
    case 'roadmap':
    case 'roadmap_revision':
      return AI_MODELS.roadmap
    case 'roadmap_answer':
    case 'roadmap_checkin':
      return AI_MODELS.router
    case 'extract':
    case 'extract_ar':
    case 'relate':
      return AI_MODELS.onboardingCrawl
    default:
      return AI_MODELS.orchestrator
  }
}

/**
 * Employee role model routes (spec §2.1, §2.5, §3.7, §4.7, §5.7, §6.7).
 *
 * Resolved centrally here — never hardcode provider/model ids in prompts, skills,
 * tools or agent implementations. Production assignments are configured but NOT
 * exercised by this rebuild; test mode resolves only the two allowlisted pairs
 * (Groq openai/gpt-oss-120b and Dahl deepseek-ai/DeepSeek-V4-Flash-0731).
 */
export type EmployeeRole = 'orchestrator' | 'director' | 'research' | 'content' | 'marketing_analyst'

export interface EmployeeRoleRoute {
  role: EmployeeRole
  primary: ModelConfig
  fallbacks: readonly FallbackTargetConfig[]
  /** Per-request application input cap (tokens, entire serialized request). */
  inputCap: number
  /** Per-request application completion cap (tokens, incl. reasoning where counted). */
  completionCap: number
}

const TEST_GROQ: ModelConfig = { provider: 'groq', model: 'openai/gpt-oss-120b' }
const TEST_DAHL: ModelConfig = { provider: 'dahl', model: 'deepseek-ai/DeepSeek-V4-Flash-0731' }
const PROD_SOV_QWEN: ModelConfig = { provider: 'sovereigneg', model: 'SovereignEG/Qwen3.8-27B-FP8' }
const PROD_SOV_HAIKU: ModelConfig = { provider: 'sovereigneg', model: 'claude-haiku-5.5' }
const PROD_SOV_LUNA: ModelConfig = { provider: 'sovereigneg', model: 'gpt-6-luna' }

const TEST_ROUTES: Record<EmployeeRole, EmployeeRoleRoute> = {
  orchestrator: { role: 'orchestrator', primary: TEST_GROQ, fallbacks: [TEST_DAHL], inputCap: 3000, completionCap: 700 },
  director: { role: 'director', primary: TEST_DAHL, fallbacks: [TEST_GROQ], inputCap: 12000, completionCap: 2500 },
  research: { role: 'research', primary: TEST_DAHL, fallbacks: [TEST_GROQ], inputCap: 12000, completionCap: 2500 },
  content: { role: 'content', primary: TEST_GROQ, fallbacks: [TEST_DAHL], inputCap: 4000, completionCap: 2000 },
  marketing_analyst: { role: 'marketing_analyst', primary: TEST_DAHL, fallbacks: [TEST_GROQ], inputCap: 12000, completionCap: 2500 },
}

const PROD_ROUTES: Record<EmployeeRole, EmployeeRoleRoute> = {
  orchestrator: { role: 'orchestrator', primary: { provider: 'groq', model: 'openai/gpt-oss-120b' }, fallbacks: [{ provider: 'sovereigneg', model: 'openai/gpt-oss-120b' }], inputCap: 3000, completionCap: 700 },
  director: { role: 'director', primary: { provider: 'dahl', model: 'deepseek-ai/DeepSeek-V4-Flash-0731' }, fallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }], inputCap: 12000, completionCap: 2500 },
  research: { role: 'research', primary: PROD_SOV_QWEN, fallbacks: [TEST_DAHL, TEST_GROQ], inputCap: 12000, completionCap: 2500 },
  content: { role: 'content', primary: PROD_SOV_HAIKU, fallbacks: [TEST_GROQ, TEST_DAHL], inputCap: 4000, completionCap: 2000 },
  marketing_analyst: { role: 'marketing_analyst', primary: PROD_SOV_LUNA, fallbacks: [TEST_DAHL, TEST_GROQ], inputCap: 12000, completionCap: 2500 },
}

/** Resolve the model route for an Employee role under the current AI mode. */
export function getEmployeeRoleRoute(role: EmployeeRole): EmployeeRoleRoute {
  return CURRENT_AI_MODE === 'test' ? TEST_ROUTES[role] : PROD_ROUTES[role]
}

/**
 * The global test-mode allowlist: only these exact provider/model pairs may run.
 * Enforced before network dispatch, including fallbacks/BYOK/defaults/retries.
 */
export const TEST_MODE_ALLOWLIST: readonly { provider: ModelConfig['provider']; model: string }[] = [
  { provider: 'groq', model: 'openai/gpt-oss-120b' },
  { provider: 'dahl', model: 'deepseek-ai/DeepSeek-V4-Flash-0731' },
]

/** True when a provider/model pair is permitted in the current mode. */
export function isProviderModelAllowed(provider: ModelConfig['provider'], model: string): boolean {
  if (CURRENT_AI_MODE === 'test') {
    return TEST_MODE_ALLOWLIST.some((p) => p.provider === provider && p.model === model)
  }
  // Production: any configured provider is allowed (paid routes are separately gated).
  return true
}