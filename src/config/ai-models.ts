/**
 * Busmora AI Model & Provider Configuration
 * Single centralized configuration for all AI models used across the application.
 * You can modify the model, provider, temperature, and token limits for any operation here.
 */

export interface ModelConfig {
  provider: 'groq' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'dahl' | 'sovereigneg' | 'custom'
  model: string
  temperature?: number
  maxTokens?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

/**
 * Global Fallback Template:
 * Standard fallback targets used across any operation if the primary model/provider fails,
 * times out, or produces invalid output.
 * 1. Redundancy: gpt-oss-120b on SovereignEG
 * 2. Fallback: openai/gpt-oss-120b on Groq
 * 3. Emergency Fallback: openai/gpt-oss-20b on Groq
 * 4. DeepSeek fallback: DeepSeek-V4-Flash-0731 on Dahl
 */
export interface FallbackTargetConfig {
  provider: ModelConfig['provider']
  model: string
  timeoutMs?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export const AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] = [
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

export const AI_MODELS = {
  /**
   * Orchestrator: the fast intent-decision call every message passes through
   * Primary: Groq -> openai/gpt-oss-120b (Redundancy: SovereignEG -> gpt-oss-120b)
   */
  orchestrator: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  /**
   * Fast conversational chat & Brain QA
   * Primary: Groq -> openai/gpt-oss-120b (Redundancy: SovereignEG -> gpt-oss-120b)
   */
  fastChat: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.6,
  },

  /**
   * Intent Router & Clarification Question Generator
   * Primary: Groq -> openai/gpt-oss-120b
   */
  router: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
  },

  /**
   * Content Writer Agent: Social Media Posts, Captions & Copy
   * SovereignEG -> claude-haiku-5.5
   */
  contentWriter: {
    provider: 'sovereigneg',
    model: 'claude-haiku-5.5',
    temperature: 0.7,
  },

  /**
   * Campaign Planner Agent: Multi-post Campaigns & Planning Briefs
   * SovereignEG -> claude-haiku-5.5
   */
  campaignPlanner: {
    provider: 'sovereigneg',
    model: 'claude-haiku-5.5',
    temperature: 0.7,
  },

  /**
   * Performance Analyst: Business Marketing Diagnosis & Constraints
   * SovereignEG -> gpt-6-luna
   */
  performanceAnalyst: {
    provider: 'sovereigneg',
    model: 'gpt-6-luna',
    temperature: 0.5,
  },

  /**
   * Roadmap Strategy Agent: Strategic Milestones & Execution Steps
   * Dahl -> DeepSeek-V4-Flash-0731
   */
  roadmap: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  /**
   * Research Director: Planning layered research brief & orchestrating tracks
   * Dahl -> DeepSeek-V4-Flash-0731
   */
  researchDirector: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  /**
   * Research Specialist Subagents: Market Scout, Competitor, Audience, Positioning, Benchmark
   * SovereignEG -> SovereignEG/Qwen3.8-27B-FP8
   */
  researchSubagent: {
    provider: 'sovereigneg',
    model: 'SovereignEG/Qwen3.8-27B-FP8',
    temperature: 0.3,
  },

  /**
   * Report Engine:
   * Dahl -> DeepSeek-V4-Flash-0731
   */
  researchSynthesis: {
    provider: 'dahl',
    model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
    temperature: 0.3,
  },

  /**
   * Onboarding Web Crawl & Scraping Extraction + Brain Graph Relater:
   * Single-request combined extraction and relations on Groq -> openai/gpt-oss-120b
   */
  onboardingCrawl: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.1,
  },
} as const satisfies Record<string, ModelConfig>

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