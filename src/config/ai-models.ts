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