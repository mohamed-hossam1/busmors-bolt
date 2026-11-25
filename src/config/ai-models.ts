import type { LanguageModel } from 'ai'
import { createGroq } from '@ai-sdk/groq'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'

export type AiEnvironmentMode = 'test' | 'production'
export type AgentRole = 'orchestrator' | 'director' | 'research' | 'content' | 'marketing-analyst'
export type AiProvider = 'groq' | 'dahl' | 'sovereigneg' | 'apinex'
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export interface ModelConfig {
  provider: AiProvider | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'custom'
  model: string
  temperature?: number
  maxTokens?: number
  reasoningEffort?: ReasoningEffort
}

export interface FallbackTargetConfig {
  provider: ModelConfig['provider']
  model: string
  timeoutMs?: number
  reasoningEffort?: ReasoningEffort
}

export interface ModelTarget {
  provider: AiProvider
  model: string
  disabled?: boolean
}

export interface RoleModelConfig {
  temperature: number
  primary: ModelTarget
  fallbacks: readonly ModelTarget[]
}

export interface ResolvedModelTarget extends ModelTarget {
  temperature: number
}

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiConfigurationError'
  }
}

export class ModelNotAllowedError extends Error {
  constructor(provider: string, model: string) {
    super(
      `Model ${provider}/${model} is not allowed in AI_MODE=test. ` +
        'Only Groq/openai/gpt-oss-120b and Dahl/zai-org/GLM-5.3-Flash may be dispatched.',
    )
    this.name = 'ModelNotAllowedError'
  }
}

export class MissingProviderCredentialsError extends Error {
  constructor(provider: AiProvider) {
    super(`Missing server-side credentials for AI provider ${provider}.`)
    this.name = 'MissingProviderCredentialsError'
  }
}

const aiModeSchema = z.enum(['test', 'production'])

export function resolveAiMode(env: NodeJS.ProcessEnv = process.env): AiEnvironmentMode {
  const parsed = aiModeSchema.safeParse(env.AI_MODE)
  if (!parsed.success) {
    throw new AiConfigurationError(
      'AI_MODE must be exactly "test" or "production". Refusing to choose a mode implicitly.',
    )
  }
  return parsed.data
}

export const AI_MODE: AiEnvironmentMode = resolveAiMode()
export const CURRENT_AI_MODE = AI_MODE
export const IS_TEST_MODE = AI_MODE === 'test'

export const TEST_ALLOWED_MODELS = [
  { provider: 'groq', model: 'openai/gpt-oss-120b' },
  { provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' },
  { provider: 'apinex', model: 'free/gpt-6-luna' },
] as const satisfies readonly ModelTarget[]

export function isModelAllowed(
  provider: string,
  model: string,
  mode: AiEnvironmentMode = AI_MODE,
): boolean {
  if (mode !== 'test') return true
  return TEST_ALLOWED_MODELS.some((allowed) => allowed.provider === provider && allowed.model === model)
}

export function assertModelAllowed(
  provider: string,
  model: string,
  mode: AiEnvironmentMode = AI_MODE,
): void {
  if (!isModelAllowed(provider, model, mode)) {
    throw new ModelNotAllowedError(provider, model)
  }
}

const ROLE_AI_MODELS = {
  orchestrator: {
    test: {
      temperature: 0.2,
      primary: { provider: 'groq', model: 'openai/gpt-oss-120b' },
      fallbacks: [{ provider: 'apinex', model: 'free/gpt-6-luna' }],
    },
    production: {
      temperature: 0.2,
      primary: { provider: 'groq', model: 'openai/gpt-oss-120b' },
      fallbacks: [{ provider: 'sovereigneg', model: 'openai/gpt-oss-120b' }],
    },
  },
  director: {
    test: {
      temperature: 0.3,
      primary: { provider: 'apinex', model: 'free/gpt-6-luna' },
      fallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }],
    },
    production: {
      temperature: 0.3,
      primary: { provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' },
      fallbacks: [
        { provider: 'groq', model: 'openai/gpt-oss-120b' },
        { provider: 'sovereigneg', model: 'gpt-6-luna', disabled: true },
      ],
    },
  },
  research: {
    test: {
      temperature: 0.3,
      primary: { provider: 'apinex', model: 'free/gpt-6-luna' },
      fallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }],
    },
    production: {
      temperature: 0.3,
      primary: { provider: 'sovereigneg', model: 'SovereignEG/Qwen3.8-27B-FP8' },
      fallbacks: [
        { provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' },
        { provider: 'groq', model: 'openai/gpt-oss-120b' },
      ],
    },
  },
  content: {
    test: {
      temperature: 0.7,
      primary: { provider: 'groq', model: 'openai/gpt-oss-120b' },
      fallbacks: [{ provider: 'apinex', model: 'free/gpt-6-luna' }],
    },
    production: {
      temperature: 0.7,
      primary: { provider: 'sovereigneg', model: 'claude-haiku-5.5' },
      fallbacks: [
        { provider: 'groq', model: 'openai/gpt-oss-120b' },
        { provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' },
      ],
    },
  },
  'marketing-analyst': {
    test: {
      temperature: 0.3,
      primary: { provider: 'apinex', model: 'free/gpt-6-luna' },
      fallbacks: [{ provider: 'groq', model: 'openai/gpt-oss-120b' }],
    },
    production: {
      temperature: 0.3,
      primary: { provider: 'sovereigneg', model: 'gpt-6-luna' },
      fallbacks: [
        { provider: 'dahl', model: 'zai-org/GLM-5.3-Flash' },
        { provider: 'groq', model: 'openai/gpt-oss-120b' },
      ],
    },
  },
} as const satisfies Record<AgentRole, Record<AiEnvironmentMode, RoleModelConfig>>

export const AI_MODELS = {
  ...ROLE_AI_MODELS,
  onboardingCrawl: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    temperature: 0.1,
  } satisfies ModelConfig,
} as const

export function getRoleModelChain(
  role: AgentRole,
  mode: AiEnvironmentMode = AI_MODE,
): readonly ResolvedModelTarget[] {
  const config = ROLE_AI_MODELS[role][mode] as RoleModelConfig
  return [config.primary, ...config.fallbacks]
    .filter((target) => !target.disabled)
    .map((target) => {
      assertModelAllowed(target.provider, target.model, mode)
      return { ...target, temperature: config.temperature }
    })
}

export function getModelConfigForOperation(operation: string): ModelConfig {
  switch (operation) {
    case 'extract':
    case 'extract_ar':
    case 'relate':
    default:
      return AI_MODELS.onboardingCrawl
  }
}

export const PROD_AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] = [
  {
    provider: 'sovereigneg',
    model: 'openai/gpt-oss-120b',
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
    model: 'zai-org/GLM-5.3-Flash',
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
    provider: 'dahl',
    model: 'zai-org/GLM-5.3-Flash',
    timeoutMs: 25000,
    reasoningEffort: 'none',
  },
] as const

export const AI_FALLBACK_TEMPLATE: readonly FallbackTargetConfig[] =
  AI_MODE === 'test' ? TEST_AI_FALLBACK_TEMPLATE : PROD_AI_FALLBACK_TEMPLATE

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value) {
    throw new AiConfigurationError(`Missing required environment variable ${name}.`)
  }
  return value
}

export function getProviderCredentials(provider: AiProvider): {
  apiKey: string
  baseURL?: string
} {
  switch (provider) {
    case 'groq':
      return { apiKey: requiredEnv(process.env, 'GROQ_API_KEY') }
    case 'dahl':
      return {
        apiKey: requiredEnv(process.env, 'DAHL_API_KEY'),
        baseURL: process.env.DAHL_BASE_URL?.trim() || 'https://inference.dahl.global/v1',
      }
    case 'sovereigneg':
      return {
        apiKey: requiredEnv(process.env, 'SOVEREIGNEG_API_KEY'),
        baseURL: process.env.SOVEREIGNEG_BASE_URL?.trim() || 'https://backend.sovereigneg.com/v1',
      }
    case 'apinex':
      return {
        apiKey: requiredEnv(process.env, 'APINEX_API_KEY'),
        baseURL: process.env.APINEX_BASE_URL?.trim() || 'https://api.apinex.bond/v1',
      }
  }
}

export function assertProviderCredentials(provider: AiProvider): void {
  getProviderCredentials(provider)
}

const groqProvider = () =>
  createGroq({
    apiKey: process.env.GROQ_API_KEY?.trim() ?? '',
  })

const dahlProvider = () =>
  createOpenAICompatible({
    name: 'dahl',
    baseURL: process.env.DAHL_BASE_URL?.trim() || 'https://inference.dahl.global/v1',
    apiKey: process.env.DAHL_API_KEY?.trim() ?? '',
  })

const sovereignEgProvider = () =>
  createOpenAICompatible({
    name: 'sovereigneg',
    baseURL: process.env.SOVEREIGNEG_BASE_URL?.trim() || 'https://backend.sovereigneg.com/v1',
    apiKey: process.env.SOVEREIGNEG_API_KEY?.trim() ?? '',
  })

const apinexProvider = () =>
  createOpenAICompatible({
    name: 'apinex',
    baseURL: process.env.APINEX_BASE_URL?.trim() || 'https://api.apinex.bond/v1',
    apiKey: process.env.APINEX_API_KEY?.trim() ?? '',
  })

export function getLanguageModel(target: ModelTarget | ResolvedModelTarget): LanguageModel {
  switch (target.provider) {
    case 'groq':
      return groqProvider().languageModel(target.model as Parameters<ReturnType<typeof groqProvider>['languageModel']>[0])
    case 'dahl':
      return dahlProvider().languageModel(target.model)
    case 'sovereigneg':
      return sovereignEgProvider().languageModel(target.model)
    case 'apinex':
      return apinexProvider().languageModel(target.model)
  }
}