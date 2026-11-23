/**
 * Busmora AI Model & Provider Configuration
 * Single centralized configuration for all AI models used across the application.
 * You can modify the model, provider, temperature, and token limits for any operation here.
 */

export interface ModelConfig {
  provider: 'groq' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'dahl' | 'custom'
  model: string
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

/**
 * Global Fallback Template:
 * Standard fallback targets used across any operation if the primary model/provider fails,
 * times out, or produces invalid output.
 * 1. Fallback: openai/gpt-oss-120b on Groq (default reasoning)
 * 2. Emergency Fallback: openai/gpt-oss-20b on Groq (default reasoning)
 */
export interface FallbackTargetConfig {
  provider: ModelConfig['provider']
  model: string
  timeoutMs?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export const AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] = [
  {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    timeoutMs: 20000,
    // reasoningEffort is omitted so it takes the provider default
  },
  {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    timeoutMs: 15000,
    // reasoningEffort is omitted so it takes the provider default
  },
] as const

export const AI_MODELS = {
  /**
   * Orchestrator: the fast intent-decision call every message passes through
   * before any task creation or Brain retrieval.
   */
  orchestrator: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  /**
   * Fast conversational chat: greetings, quick chitchat, "What you can do for me",
   * and "What you know about me" (instant Brain knowledge retrieval).
   */
  fastChat: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.6,
  },

  /**
   * Intent Router & Clarification Question Generator.
   * Quickly determines if request needs clarification or which deliverable to produce.
   */
  router: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  /**
   * Heavy Task Generation: Copywriting, Post Drafts, Marketing Campaigns, Performance Diagnosis.
   */
  heavyTask: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.7,
  },

  /**
   * Advanced Marketing Research & Competitor Intelligence:
   * Synthesis of search results, source auditing, and deep market analysis.
   */
  research: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.3,
  },

  /**
   * Onboarding Web Crawl & Scraping Extraction:
   * Used during onboarding to extract business facts and relations from crawled websites.
   * Primary: DeepSeek-V4-Flash on Dahl with reasoning_effort: "none" (thinking disabled).
   * Fallback: Handled transparently by handleSharedCrawlRequest to openai/gpt-oss-120b on Groq.
   */
  onboardingCrawl: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.1,
    reasoningEffort: 'none',
  },
} as const satisfies Record<string, ModelConfig>

export type AiModelRole = keyof typeof AI_MODELS

/** Helper to get model config for a given operation */
export function getModelConfigForOperation(operation: string): ModelConfig {
  switch (operation) {
    case 'orchestrate':
      return AI_MODELS.orchestrator
    case 'chat':
    case 'brain_answer':
      return AI_MODELS.fastChat
    case 'route':
    case 'clarify':
      return AI_MODELS.router
    case 'copy':
    case 'campaign':
    case 'diagnose':
    case 'roadmap':
      return AI_MODELS.heavyTask
    case 'research':
    case 'analyze':
      return AI_MODELS.research
    case 'extract':
    case 'extract_ar':
    case 'relate':
      return AI_MODELS.onboardingCrawl
    default:
      return AI_MODELS.orchestrator
  }
}