/**
 * Busmora AI Model & Provider Configuration
 * Single centralized configuration for all AI models used across the application.
 * You can modify the model, provider, temperature, and token limits for any operation here.
 *
 * Dual-mode architecture (AI_MODE):
 *  - 'production': Full multi-provider setup (SovereignEG, Groq, Dahl).
 *  - 'test':       SovereignEG is fully excluded to preserve credits. All agents are
 *                  routed exclusively to Groq and Dahl, so no SovereignEG tokens are
 *                  consumed during local development, integration, or E2E testing.
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
 * Global Fallback Template:
 * Standard fallback targets used across any operation if the primary model/provider fails,
 * times out, or produces invalid output.
 *
 * Production: SovereignEG -> gpt-oss-120b, Groq -> openai/gpt-oss-120b,
 *             Groq -> openai/gpt-oss-20b, Dahl -> DeepSeek-V4-Flash-0731
 * Test:       Groq -> openai/gpt-oss-120b, Groq -> openai/gpt-oss-20b,
 *             Dahl -> DeepSeek-V4-Flash-0731 (no SovereignEG targets)
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

/**
 * Production model routing. SovereignEG is used for content, campaign, diagnose,
 * and research subagents; Dahl handles roadmap/research synthesis; Groq handles
 * the fast operational paths.
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

  contentWriter: {
    provider: 'sovereigneg',
    model: 'claude-haiku-5.5',
    temperature: 0.7,
  },

  campaignPlanner: {
    provider: 'sovereigneg',
    model: 'claude-haiku-5.5',
    temperature: 0.7,
  },

  performanceAnalyst: {
    provider: 'sovereigneg',
    model: 'gpt-6-luna',
    temperature: 0.5,
  },

  roadmap: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  researchDirector: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  researchSubagent: {
    provider: 'sovereigneg',
    model: 'SovereignEG/Qwen3.8-27B-FP8',
    temperature: 0.3,
  },

  researchSynthesis: {
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
 * Test model routing. Every SovereignEG primary is replaced by Groq or Dahl so
 * that no SovereignEG tokens are consumed.
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

  contentWriter: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.7,
  },

  campaignPlanner: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.7,
  },

  performanceAnalyst: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.5,
  },

  roadmap: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  researchDirector: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  researchSubagent: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  researchSynthesis: {
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

/** Helper to get model config for a given operation */
export function getModelConfigForOperation(operation: string): ModelConfig {
  switch (operation) {
    case 'orchestrate':
      return AI_MODELS.orchestrator
    case 'chat':
    case 'brain_answer':
    case 'title':
      return AI_MODELS.fastChat
    case 'route':
    case 'clarify':
    case 'research_profile':
      return AI_MODELS.router
    case 'copy':
      return AI_MODELS.contentWriter
    case 'campaign':
      return AI_MODELS.campaignPlanner
    case 'diagnose':
      return AI_MODELS.performanceAnalyst
    case 'roadmap':
      return AI_MODELS.roadmap
    case 'research_director':
      return AI_MODELS.researchDirector
    case 'research_subagent':
      return AI_MODELS.researchSubagent
    case 'research':
    case 'analyze':
    case 'research_synthesis':
      return AI_MODELS.researchSynthesis
    case 'extract':
    case 'extract_ar':
    case 'relate':
      return AI_MODELS.onboardingCrawl
    default:
      return AI_MODELS.orchestrator
  }
}