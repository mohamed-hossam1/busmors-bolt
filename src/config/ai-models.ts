/**
 * Busmora AI Model & Provider Configuration
 * Single centralized configuration for all AI models used across the application.
 * You can modify the model, provider, temperature, and token limits for any operation here.
 */

export interface ModelConfig {
  provider: 'groq' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom'
  model: string
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
}

export const AI_MODELS = {
  /**
   * Orchestrator: the fast intent-decision call every message passes through
   * before any task creation or Brain retrieval. Effort: LOW for minimal latency.
   */
  orchestrator: {
    provider: (process.env.AI_ORCHESTRATOR_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_ORCHESTRATOR_MODEL || process.env.AI_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.2,
    maxTokens: 900,
    reasoningEffort: 'low' as const,
  },

  /**
   * Fast conversational chat: greetings, quick chitchat, "What you can do for me",
   * and "What you know about me" (instant Brain knowledge retrieval).
   * Effort: LOW (blazing fast sub-second inference).
   */
  fastChat: {
    provider: (process.env.AI_FAST_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_FAST_MODEL || process.env.AI_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.6,
    maxTokens: 1200,
    reasoningEffort: 'low' as const,
  },

  /**
   * Intent Router & Clarification Question Generator.
   * Quickly determines if request needs clarification or which deliverable to produce.
   * Effort: LOW.
   */
  router: {
    provider: (process.env.AI_ROUTER_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_ROUTER_MODEL || process.env.AI_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.2,
    maxTokens: 1000,
    reasoningEffort: 'low' as const,
  },

  /**
   * Heavy Task Generation: Copywriting, Post Drafts, Marketing Campaigns, Performance Diagnosis.
   * Effort: HIGH - maxTokens is deliberately unspecified so the model has unlimited completion capacity.
   */
  heavyTask: {
    provider: (process.env.AI_HEAVY_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_HEAVY_MODEL || process.env.AI_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.7,
    reasoningEffort: 'high' as const,
  },

  /**
   * Advanced Marketing Research & Competitor Intelligence:
   * Synthesis of search results, source auditing, and deep market analysis.
   * Effort: HIGH - maxTokens is deliberately unspecified so the model has unlimited capacity for deep reasoning & reporting.
   */
  research: {
    provider: (process.env.AI_RESEARCH_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_RESEARCH_MODEL || process.env.AI_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.3,
    reasoningEffort: 'high' as const,
  },

  /**
   * Onboarding Web Crawl & Scraping Extraction:
   * Used during onboarding to extract business facts and relations from crawled websites.
   * Effort: HIGH - maxTokens is deliberately unspecified to allow complete extraction without truncation.
   */
  onboardingCrawl: {
    provider: (process.env.AI_CRAWL_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_CRAWL_MODEL || process.env.AI_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.1,
    reasoningEffort: 'high' as const,
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