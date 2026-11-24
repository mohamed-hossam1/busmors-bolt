/**
 * Pure conversation-title helpers.
 *
 * Shared by the title API (server) and the chat header/history (client) so a
 * title is cleaned and clamped the same way everywhere. No `server-only`
 * import here: the client needs these helpers too.
 *
 * The hard part is conversational filler. Models happily return a real topic
 * glued to a pleasantry, e.g.
 *   "معرفة تفاصيل البزنس أهلاً بيك! علشان أقدر أساعدك بأفضل طريق"
 * A title must be the topic only ("معرفة تفاصيل البزنس"), never the greeting.
 */

const ARABIC_RE = /[\u0600-\u06FF]/
const DEFAULT_AR = 'محادثة جديدة'
const DEFAULT_EN = 'New Chat'
const MAX_TITLE_WORDS = 4
const MAX_TITLE_CHARS = 32

/** Arabic diacritics + tatweel. Titles read fine without them. */
const ARABIC_MARKS = /[\u0610-\u061A\u064B-\u0652\u0670\u06D6-\u06ED\u0640]/g

const SIMPLE_GREETING_RE = /^(?:مرحبا|مرحباً|أهلا|أهلاً|اهلا|إزيك|ازيك|ازيكوا|عامل ايه|كيفك|كيف الحال|شخبارك|صباح الخير|مساء الخير|سلام عليكم|السلام عليكم|سلام|هاي|هلو|hello|hi|hey|good morning|good afternoon|good evening|how are you|howdy)[\s!.؟?]*$/i

/**
 * Filler that must never appear inside a title. Most of these start the
 * assistant's own reply, so they mark where the real topic stops.
 */
const CHATTER_RES: RegExp[] = [
  /(?:أ|إ|آ|ا)هلا\s+(?:بيك|بك|بكم|وسهلا)/,
  /مرحبا\s+(?:بيك|بك|بكم)/,
  /(?:إ|ا)زيك(?:و?ا)?/,
  /(?:أنا|انا)\s+(?:ال)?(?:مساعد|مساعدك)/,
  /(?:ال)?مساعد\s+(?:التسويقي|التسويقية)/,
  /(?:علشان|عشان|كي|كيف)\s+(?:أقدر|اقدر|نقدر)\s+(?:أساعدك|اساعدك|نساعدك)/,
  /(?:أقدر|اقدر|نقدر)\s+(?:أساعدك|اساعدك|نساعدك)/,
  /what\s+would\s+you\s+like/i,
  /how\s+can\s+i\s+help/i,
  /i'?m\s+(?:your\s+)?(?:busmora\s+)?(?:marketing\s+)?assistant/i,
  /hello[!,\s]+i'?m/i,
]

/** Output that is the assistant talking, never a title. */
const NON_TITLE_START_RE = /^(?:أنا|انا)\s+بخير|^i(?:'m|\s+am)\s+(?:fine|good|well)|^(?:sure|okay|ok|certainly|of course|here(?:'s| is)|as an ai)\b/i

const DEFAULT_TITLE_RE = /^(?:محادثة\s+جديدة|new\s+chat|new\s+conversation|first\s+conversation|بدء\s+محادثة)$/i

/** Strip markdown, quotes, prefixes and stray punctuation from a candidate title. */
function normalizeTitle(text: string): string {
  let cleaned = text.replace(/```[a-z]*\n?|```/gi, '').trim()
  cleaned = cleaned.replace(ARABIC_MARKS, '').replace(/\s+/g, ' ')

  // Remove surrounding quotes, backticks, asterisks, brackets repeatedly.
  cleaned = cleaned.replace(/^[*_#~`"«»“”‘’'[\]()\s]+|[*_#~`"«»“”‘’'[\]()\s.!?،؛\-–—:]+$/g, '').trim()

  // Remove prefixes like "Title:", "العنوان:", "بدء محادثة:", "موضوع:".
  cleaned = cleaned.replace(/^(?:title|subject|topic|(?:ال)?عنوان(?:\s+المحادثة)?|(?:ال)?موضوع|بدء\s+محادثة)\s*[:：\-–—]?\s*/i, '').trim()

  // Remove wrapping punctuation that sat outside the prefix.
  cleaned = cleaned.replace(/^[*_#~`"«»“”‘’'[\]()\s]+|[*_#~`"«»“”‘’'[\]()\s.!?،؛\-–—:]+$/g, '').trim()
  return cleaned
}

/** True when the text is nothing but greetings/persona chatter. */
function isOnlyChatter(text: string): boolean {
  if (!text.trim()) return true
  if (SIMPLE_GREETING_RE.test(text.trim())) return true
  let rest = text
  for (const pattern of CHATTER_RES) rest = rest.replace(pattern, ' ')
  rest = rest.replace(/[.!?،؛:\-–—\s]+/g, ' ').trim()
  return rest.length < 2
}

/** Cut the title at the first pleasantry/persona phrase that follows a topic. */
function stripTrailingChatter(text: string): string {
  let cut = text.length
  for (const pattern of CHATTER_RES) {
    const match = pattern.exec(text)
    if (match && match.index > 0 && match.index < cut) cut = match.index
  }
  return text.slice(0, cut).trim()
}

/** Drop a leading greeting when a real topic follows it ("أهلاً! خطة تسويق"). */
function stripLeadingGreeting(text: string): string {
  const firstBreak = text.search(/[.!?،؛\n]/)
  if (firstBreak === -1) return text
  const head = text.slice(0, firstBreak).trim()
  if (!isOnlyChatter(head)) return text
  const rest = text.slice(firstBreak + 1).trim()
  return rest || text
}

/** Remove conversational filler from both ends of a title candidate. */
function stripChatter(text: string): string {
  let body = stripTrailingChatter(text)
  body = stripLeadingGreeting(body)
  body = stripTrailingChatter(body)
  return body.trim()
}

/** Keep at most 4 words / 32 chars, without cutting a word in half. */
function clampTitle(text: string): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  let out = ''
  for (const word of words.slice(0, MAX_TITLE_WORDS)) {
    const candidate = out ? `${out} ${word}` : word
    if (candidate.length > MAX_TITLE_CHARS) break
    out = candidate
  }
  if (!out) out = words[0].slice(0, MAX_TITLE_CHARS)
  return out.replace(/[.!?،؛:\-–—]+$/g, '').trim()
}

function defaultTitle(prompt: string): string {
  return ARABIC_RE.test(prompt) ? DEFAULT_AR : DEFAULT_EN
}

function isDefaultTitle(text: string): boolean {
  return DEFAULT_TITLE_RE.test(text.trim())
}

export function isSimpleGreeting(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 50) return false
  return SIMPLE_GREETING_RE.test(trimmed)
}

/**
 * Derive a concise title from the user's own message when the model is
 * unavailable. A greeting-only message becomes the neutral default instead of
 * turning "ازيك" into a conversation title.
 */
export function extractFallbackTitle(prompt: string): string {
  const normalized = normalizeTitle(prompt)
  if (!normalized || isSimpleGreeting(prompt) || isOnlyChatter(normalized) || NON_TITLE_START_RE.test(normalized)) {
    return defaultTitle(prompt)
  }
  const title = clampTitle(stripChatter(normalized))
  return title && !isDefaultTitle(title) ? title : defaultTitle(prompt)
}

/** Clamp the model output to a safe, concise title (2-4 words, max 32 chars). */
export function cleanChatTitle(text: string, fallbackPrompt?: string): string {
  const fallback = fallbackPrompt ? extractFallbackTitle(fallbackPrompt) : DEFAULT_AR
  const normalized = normalizeTitle(text ?? '')
  if (!normalized) return fallback
  if (NON_TITLE_START_RE.test(normalized) || isOnlyChatter(normalized)) return fallback

  const title = clampTitle(stripChatter(normalized))
  if (!title || isOnlyChatter(title) || isDefaultTitle(title)) return fallback
  return title
}

/**
 * Format a stored conversation title for display. Old rows may still hold raw
 * first messages ("معرفة تفاصيل البزنس أهلاً بيك!..."), so apply the same
 * cleaning and clamping here instead of trusting the database value.
 */
export function formatConversationTitle(title: string | null | undefined, fallback: string): string {
  if (!title || !title.trim()) return fallback
  const normalized = normalizeTitle(title)
  if (!normalized || isDefaultTitle(normalized) || isOnlyChatter(normalized)) return fallback
  if (NON_TITLE_START_RE.test(normalized)) return fallback
  return clampTitle(stripChatter(normalized)) || fallback
}
