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
   * Fast conversational chat: greetings, quick chitchat, and instant Brain knowledge retrieval.
   * Uses ultra-fast Groq LPU inference for sub-second responses.
   */
  fastChat: {
    provider: (process.env.AI_FAST_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_FAST_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.6,
    maxTokens: 1200,
  },

  /**
   * Intent Router & Clarification Question Generator.
   * Quickly determines if request needs clarification or which deliverable to produce.
   */
  router: {
    provider: (process.env.AI_ROUTER_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_ROUTER_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.2,
    maxTokens: 1000,
  },

  /**
   * Heavy Task Generation: Copywriting, Post Drafts, Marketing Campaigns, Performance Diagnosis.
   * High-intelligence model for professional marketing deliverables.
   */
  heavyTask: {
    provider: (process.env.AI_HEAVY_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_HEAVY_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxTokens: 6000,
  },

  /**
   * Marketing Research & Competitor Intelligence:
   * Synthesis of search results, source auditing, and report creation.
   */
  research: {
    provider: (process.env.AI_RESEARCH_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_RESEARCH_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.3,
    maxTokens: 6000,
  },

  /**
   * Onboarding Web Crawl & Scraping Extraction:
   * Used during onboarding to extract business facts and relations from crawled websites.
   */
  onboardingCrawl: {
    provider: (process.env.AI_CRAWL_PROVIDER || process.env.AI_PROVIDER || 'groq') as ModelConfig['provider'],
    model: process.env.AI_CRAWL_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.1,
    maxTokens: 4000,
    reasoningEffort: 'low' as const,
  },
} as const satisfies Record<string, ModelConfig>

export type AiModelRole = keyof typeof AI_MODELS

/** Helper to get model config for a given operation */
export function getModelConfigForOperation(operation: string): ModelConfig {
  switch (operation) {
    case 'chat':
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
      return AI_MODELS.fastChat
  }
}
