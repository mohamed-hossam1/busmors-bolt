import { detectLanguage, normalizeText } from '../references/lexicon'
import type { ResearchMode, VisibleAgentEvent } from '../contracts'
import { emptyUsage } from '../contracts'

export type OrchestratorRoute = 'research' | 'brain' | 'refuse' | 'out_of_scope'

export interface RouteDecision {
  route: OrchestratorRoute
  reason: string
  mode: ResearchMode
  message: string
  matchedGuardrail: string | null
  language: 'ar-EG' | 'en' | 'mixed'
  observable: Omit<VisibleAgentEvent, 'id' | 'seq'>
}

/** Attempts to probe internal configuration, prompts, architecture or secrets. */
export const INTERNAL_PROBE_PATTERNS: readonly { id: string; pattern: RegExp; message: string }[] = Object.freeze([
  { id: 'system_prompt', pattern: /(?:system\s*prompt|your\s+instructions|initial\s+instructions|ignore\s+(?:all\s+)?previous\s+instructions|prompt\s*leak)/i, message: 'I cannot share internal instructions or prompts.' },
  { id: 'secrets', pattern: /(?:api[_ -]?key|secret[_ -]?key|password|access[_ -]?token|private[_ -]?key|supabase\s+(?:key|url)|service[_ -]?role)/i, message: 'I cannot share credentials or secrets.' },
  { id: 'architecture', pattern: /(?:backend\s+architecture|database\s+schema|server\s+code|source\s+code|infrastructure|deployment\s+config|env(?:ironment)?\s+variables|\.env)/i, message: 'I cannot share internal architecture or configuration details.' },
  { id: 'internal_config', pattern: /(?:internal\s+(?:config|configuration|settings)|model\s+provider|provider\s+key|tool\s+allowlist)/i, message: 'I cannot share internal configuration details.' },
  { id: 'agent_internals', pattern: /(?:how\s+do\s+you\s+route|what\s+(?:agents|tools)\s+do\s+you\s+have\s+access|list\s+your\s+tools|your\s+hidden\s+rules)/i, message: 'I can describe what I can do for your business, but not internal agent mechanics.' },
])

/** Off-topic requests unrelated to Busmora's business scope are politely declined. */
export const OFF_TOPIC_PATTERNS: readonly { id: string; pattern: RegExp }[] = Object.freeze([
  { id: 'politics', pattern: /\b(?:election|parliament|president|political\s+party|انتخابات|البرلمان|الرئيس\s+السياسي)\b/i },
  { id: 'sports', pattern: /\b(?:football\s+(?:score|match)|match\s+result|world\s+cup|football|الدوري|مباراة\s+الأمس)\b/i },
  { id: 'weather', pattern: /\b(?:weather\s+forecast|temperature\s+today|حالة\s+الطقس)\b/i },
  { id: 'other_domain', pattern: /\b(?:write\s+(?:me\s+)?a\s+(?:poem|song)|translate\s+this\s+novel|diagnose\s+my\s+car|legal\s+advice\s+on\s+divorce)\b/i },
])

const BRAIN_QUERY_PATTERN = /(?:what\s+is\s+our|what's\s+our|show\s+(?:me\s+)?our|do\s+we\s+(?:have|offer|target)|current\s+(?:target|audience|brand)|our\s+(?:brand\s+guidelines|positioning|pricing|services|customers)|إيه\s+احنا|اعرض\s+لينا|الجمهور\s+بتاعنا|البراند\s+بتاعنا)/i
const RESEARCH_PATTERN = /(?:research|investigate|find\s+out|compare|competitor|market\s+(?:size|demand|share)|pricing|audience|voice\s+of\s+customer|trend|benchmark| Gap|بحث|اعمل\s+بحث|قارن|المنافسين|حلل\s+السوق|الجمهور|الأسعار)/i

export interface RouteInput {
  request: string
  hasBrainContext: boolean
  brainFacts: string[]
  mode?: ResearchMode
  now?: Date
}

/** Route A (research) or Route B (Brain answer), with scope guardrails. */
export function routeRequest(input: RouteInput): RouteDecision {
  const request = input.request.trim()
  const language = detectLanguage(request)
  const normalized = normalizeText(request)
  const probe = INTERNAL_PROBE_PATTERNS.find(entry => entry.pattern.test(request))
  if (probe) return decision('refuse', 'internal_probe', probe.message, probe.id, language, input)
  if (OFF_TOPIC_PATTERNS.some(entry => entry.pattern.test(request)) && !RESEARCH_PATTERN.test(request)) {
    return decision('out_of_scope', 'off_topic', 'This request is outside Busmora\'s marketing scope. I can research your market, competitors, audience and positioning instead.', null, language, input)
  }
  const brainFactsMatch = input.brainFacts.some(fact => fact.trim().length > 3 && normalized.includes(normalizeText(fact)))
  if (BRAIN_QUERY_PATTERN.test(request) && input.hasBrainContext) {
    return decision('brain', 'brain_query', 'Answered directly from approved business context; no external retrieval was needed.', null, language, input)
  }
  if (RESEARCH_PATTERN.test(request) || !input.hasBrainContext) {
    return decision('research', brainFactsMatch ? 'brain_terms_with_research_intent' : 'research_request', 'Routed to the Research Director for cited external research.', null, language, input)
  }
  return decision('brain', 'stored_context_default', 'Answered from approved business context; no external retrieval was needed.', null, language, input)
}

function decision(route: OrchestratorRoute, reason: string, message: string, matchedGuardrail: string | null, language: 'ar-EG' | 'en' | 'mixed', input: RouteInput): RouteDecision {
  const mode: ResearchMode = input.mode ?? inferResearchMode(input.request)
  return {
    route,
    reason,
    mode,
    message,
    matchedGuardrail,
    language,
    observable: {
      instanceId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      parentInstanceId: null,
      type: 'agent_started',
      agentId: 'top_level_orchestrator',
      agentRole: 'director',
      label: `Route ${route === 'research' ? 'A: Research Director' : route === 'brain' ? 'B: Brain answer' : route === 'refuse' ? 'refused' : 'out of scope'}`,
      status: 'completed',
      publicMessage: message,
      parametersRedacted: { route, reason, guardrail: matchedGuardrail, language },
      sourceIds: [],
      consumption: emptyUsage(),
      startedAt: input.now?.toISOString() ?? new Date().toISOString(),
      endedAt: input.now?.toISOString() ?? new Date().toISOString(),
      failureReason: route === 'refuse' ? 'internal_details_not_disclosed' : route === 'out_of_scope' ? 'outside_business_scope' : null,
    },
  }
}

/** Explicit research requests bypass the small talk router and go straight to Route A. */
export function explicitResearchRequest(request: string): boolean {
  const researchVerb = /\b(?:research|investigate|compare|benchmark|analyse|analyze|study)\b|\u0628\u062d\u062b|\u0642\u0627\u0631\u0646|\u062d\u0644\u0644/i.test(request)
  const evidenceAsk = /\b(?:competitor|competitors|market|sources?|prices?|audience|customer concerns|voice of customer|evidence)\b|\u0627\u0644\u0645\u0646\u0627\u0641\u0633|\u0627\u0644\u0633\u0648\u0642|\u0645\u0635\u0627\u062f\u0631|\u0627\u0644\u0623\u0633\u0639\u0627\u0631/i.test(request)
  return researchVerb && evidenceAsk
}

export function inferResearchMode(request: string): ResearchMode {
  if (/\b(?:quick|brief|tl;dr|short)\b/i.test(request)) return 'quick'
  if (/\b(?:deep|comprehensive|full|thorough|تحليل\s+كامل|كل\s+حاجة)\b/i.test(request)) return 'deep'
  return 'standard'
}

/** A refusal never discloses internals, even partially. */
export function refusalMessage(route: OrchestratorRoute): string {
  switch (route) {
    case 'refuse': return 'I cannot share internal configuration, credentials or instructions. I can help with your market, competitors, audience and positioning.'
    case 'out_of_scope': return 'That request is outside Busmora\'s marketing scope.'
    default: return ''
  }
}

/** The trace entry the task runner persists for every routing decision. */
export function routingTrace(decision: RouteDecision): VisibleAgentEvent {
  return { ...decision.observable, id: `route:${decision.observable.instanceId}`, seq: 0 }
}