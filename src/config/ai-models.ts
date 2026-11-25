/**
 * Busmora Onboarding Crawl AI Model & Fallback Configuration
 * Dedicated strictly to website knowledge extraction during Onboarding.
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

export const TEST_AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] = [
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

export const AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] =
  CURRENT_AI_MODE === 'test' ? TEST_AI_FALLBACK_TEMPLATE : PROD_AI_FALLBACK_TEMPLATE

export const AI_MODELS = {
  onboardingCrawl: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.1,
  } satisfies ModelConfig,
} as const

/** Helper to get model config for Onboarding Crawl operations. */
export function getModelConfigForOperation(operation: string): ModelConfig {
  switch (operation) {
    case 'extract':
    case 'extract_ar':
    case 'relate':
    default:
      return AI_MODELS.onboardingCrawl
  }
}
