// Deterministic, server-enforced guardrails. These run BEFORE any model call and
// are the real security boundary (defense in depth): prompt-injection / secret /
// override attempts are refused without touching the model, off-topic requests
// are declined, and a tiny set of exact greetings is answered instantly.
//
// The guardrails also emit a NON-security hint (likely_direct | likely_brain |
// likely_task) that only biases the model prompt. The model always makes the
// final path decision by intent, never by keyword.

import type { GuardrailResult } from './contracts'
import { REFUSAL_OUT_OF_SCOPE, REFUSAL_SYSTEM_PROBE } from './prompt'

interface ProbePattern {
  id: string
  pattern: RegExp
  message: string
  injection: boolean
}

/** Attempts to read internal configuration, prompts, credentials or override rules. */
export const INTERNAL_PROBE_PATTERNS: readonly ProbePattern[] = Object.freeze([
  { id: 'system_prompt', pattern: /(?:system\s*prompt|your\s+(?:initial\s+)?instructions|initial\s+instructions|repeat\s+(?:the\s+)?(?:text|words)\s+above|prompt\s*leak|print\s+your\s+(?:prompt|instructions))/i, message: REFUSAL_SYSTEM_PROBE, injection: true },
  { id: 'override', pattern: /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|disregard\s+(?:your|the)\s+(?:rules|instructions)|override\s+your\s+(?:rules|instructions)|you\s+are\s+now\s+(?:in\s+)?(?:developer|jailbroken|dan)\b|forget\s+(?:all\s+)?(?:previous|prior)\s+instructions)/i, message: REFUSAL_SYSTEM_PROBE, injection: true },
  { id: 'role_manipulation', pattern: /(?:pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:different|new|unrestricted)|act\s+as\s+(?:if\s+you\s+have\s+no|an?\s+unrestricted)|developer\s+mode|no\s+restrictions?\s+mode)/i, message: REFUSAL_SYSTEM_PROBE, injection: true },
  { id: 'secrets', pattern: /(?:api[_ -]?key|secret[_ -]?key|password|access[_ -]?token|private[_ -]?key|supabase\s+(?:key|url)|service[_ -]?role|credentials?|\.env\b|environment\s+variables?)/i, message: REFUSAL_SYSTEM_PROBE, injection: true },
  { id: 'architecture', pattern: /(?:backend\s+architecture|database\s+schema|server\s+code|source\s+code|infrastructure|deployment\s+config|internal\s+(?:config|configuration)|model\s+provider|tool\s+allowlist)/i, message: REFUSAL_SYSTEM_PROBE, injection: false },
  { id: 'agent_internals', pattern: /(?:how\s+do\s+you\s+route|what\s+(?:agents|tools)\s+do\s+you\s+have\s+access|list\s+your\s+(?:tools|agents)|your\s+hidden\s+rules|show\s+me\s+your\s+tools)/i, message: REFUSAL_SYSTEM_PROBE, injection: false },
])

/** Requests unrelated to Busmora's marketing/business scope are politely declined. */
export const OFF_TOPIC_PATTERNS: readonly ProbePattern[] = Object.freeze([
  { id: 'politics', pattern: /\b(?:election|parliament|president|political\s+party|انتخابات|البرلمان|الرئيس\s+السياسي)\b/i, message: REFUSAL_OUT_OF_SCOPE, injection: false },
  { id: 'sports', pattern: /\b(?:football\s+(?:score|match)|match\s+result|world\s+cup|الدوري|مباراة\s+الأمس)\b/i, message: REFUSAL_OUT_OF_SCOPE, injection: false },
  { id: 'weather', pattern: /\b(?:weather\s+forecast|temperature\s+today|حالة\s+الطقس)\b/i, message: REFUSAL_OUT_OF_SCOPE, injection: false },
  { id: 'other_domain', pattern: /\b(?:write\s+(?:me\s+)?a\s+(?:poem|song)|translate\s+this\s+novel|diagnose\s+my\s+car|legal\s+advice\s+on\s+divorce)\b/i, message: REFUSAL_OUT_OF_SCOPE, injection: false },
])

const TASK_VERB = /\b(?:create|write|build|generate|make|prepare|draft|design|produce|research|investigate|analyse|analyze|compare|plan|schedule|集|اكتب|اعمل|جهاز|حلل|قارن|اعمل\s+بحث|صمم)\b/i
const BRAIN_TERMS = /\b(?:our|we|us|company|brand|product|price|pricing|audience|customer|service|cities|positioning|voice|tone|advantage|offer|محل|شركتنا|البراند|المنتج|الاسعار|الأسعار|الجمهور|الخدمات|المميزات)\b/i
const QUESTION_WORD = /^(?:what|which|who|how|where|when|why|do|does|are|is|can|could|would|should|إيه|إزاي|مين|فين|هل|ليه|متى|إمتى)\b/i

function normalizeArabic(value: string): string {
  return value
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u0626')
    .replace(/\u0640/g, '')
}

const AR_GREETINGS = ['\u0627\u0644\u0633\u0644\u0627\u0645 \u0639\u0644\u064a\u0643\u0645', '\u0627\u0632\u064a\u0643', '\u0639\u0627\u0645\u0644 \u0627\u064a\u0647', '\u0627\u064a\u0647 \u0627\u0644\u0627\u062e\u0628\u0627\u0631', '\u0645\u064a\u0646 \u0627\u0646\u062a', '\u0627\u0646\u062a \u0645\u064a\u0646', '\u0627\u0647\u0644\u0627', '\u0627\u0647\u0644\u0627 \u0628\u064a\u0643']
const EN_GREETING = /^(?:hi|hii+|hey+|hello+|hey\s+there|good\s+(?:morning|afternoon|evening)|how\s+are\s+you(?:\s+doing)?[?!.]*|what's?\s+up[?!.]*|who\s+are\s+you[?!.]*)$/i

/** Conservative exact-greeting detection for an instant, zero-model direct answer. */
export function detectGreeting(request: string): { lang: 'en' | 'ar'; reply: string } | null {
  const text = request.trim()
  if (!text || text.length > 40) return null
  if (EN_GREETING.test(text)) {
    return {
      lang: 'en',
      reply: 'Hi! I’m the Busmora assistant. I can help with content, campaigns, competitor research, or any question about your company’s own data. What would you like to do?',
    }
  }
  const normalized = normalizeArabic(text).replace(/[?!.\u061f]+$/g, '').trim()
  if (AR_GREETINGS.some((phrase) => normalizeArabic(phrase) === normalized)) {
    return {
      lang: 'ar',
      reply: 'أهلاً بيك! أنا المساعد الذكي بتاع Busmora. أقدر أساعدك في المحتوى، الحملات، تحليل المنافسين، أو أي سؤال عن بيانات شركتك. تحب نبدأ بإيه؟',
    }
  }
  return null
}

function allow(request: string, hint: GuardrailResult['hint']): GuardrailResult {
  return { action: 'allow', reason: 'no_guardrail_triggered', message: '', hint, injection: false }
}

function hintFor(request: string): GuardrailResult['hint'] {
  if (TASK_VERB.test(request)) return 'likely_task'
  if (QUESTION_WORD.test(request.trim()) && BRAIN_TERMS.test(request)) return 'likely_brain'
  return 'likely_direct'
}

/** Server-enforced decision made before any model call. */
export function evaluateGuardrails(request: string): GuardrailResult {
  const probe = INTERNAL_PROBE_PATTERNS.find((entry) => entry.pattern.test(request))
  if (probe) {
    return { action: 'refuse', reason: `probe:${probe.id}`, message: probe.message, hint: null, injection: probe.injection }
  }
  const offTopic = OFF_TOPIC_PATTERNS.find((entry) => entry.pattern.test(request))
  if (offTopic) {
    return { action: 'out_of_scope', reason: `off_topic:${offTopic.id}`, message: offTopic.message, hint: null, injection: false }
  }
  return allow(request, hintFor(request))
}