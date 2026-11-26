import type { EmployeeRunState } from './run-state'

/**
 * Non-empty reply guarantee (Phase 3.5).
 *
 * A tool-only turn (e.g. the model calls propose_brain_change and finishes on
 * the tool call) can yield an empty `output`. The chat route must never surface
 * an empty reply or a silent failure, so this synthesizes a clear, human
 * confirmation derived from the structured artifacts the turn produced.
 */

const ARABIC_RE = /[\u0600-\u06FF]/

/** Cheap, dependency-free Arabic script detection for fallback copy. */
export function isArabicText(text: string | null | undefined): boolean {
  return typeof text === 'string' && ARABIC_RE.test(text)
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

/**
 * Return a guaranteed non-empty reply. A non-empty model output is preserved
 * verbatim; otherwise a concise confirmation is chosen from the structured
 * outputs, in the user's language (Arabic when the request was Arabic).
 */
export function ensureNonEmptyReply(
  output: string | null | undefined,
  state: EmployeeRunState,
  isArabic: boolean,
  runInfo?: { status?: string; stopReason?: string },
): string {
  const trimmed = typeof output === 'string' ? output.trim() : ''
  if (trimmed) return trimmed

  // A tool-only Orchestrator turn (e.g. it delegated to the Director and
  // finished on the tool call) has no prose of its own. Never swallow the
  // Director's real output behind a generic fallback: surface it verbatim.
  const directorReply = typeof state.directorReply === 'string' ? state.directorReply.trim() : ''
  if (directorReply) return directorReply

  // The workspace used all 6 beta heavy tasks before the Director could run.
  // Be honest and reassuring: general chat and Business Brain Q&A stay unlimited.
  if (state.quotaExhausted) {
    return isArabic
      ? 'استخدمت كل الـ 6 مهام المتقدمة المطلوبة في النسخة التجريبية. الشات العادي والأسئلة عن بيانات مشروعك (Business Brain) شغّالين زي ما هم من غير حدود.'
      : 'You have used all 6 beta advanced tasks. General chat and Business Brain Q&A remain unlimited.'
  }

  if (state.clarification) {
    return isArabic
      ? 'محتاج أوضّح نقطة صغيرة قبل ما أكمل. جاوبني على اللي تحت وأنا هكمّل على طول.'
      : 'I need to clarify one quick thing before I continue. Answer below and I’ll carry on.'
  }

  if (state.brainProposals.length > 0) {
    return isArabic
      ? 'اقترحت تحديث في بيانات مشروعك. راجع الكارت اللي تحت واختار «موافق» أو «رفض».'
      : 'I’ve proposed an update to your business data. Review the card below and choose Approve or Reject.'
  }

  if (state.deliverables.length > 0 || state.drafts.length > 0) {
    const hasDraft = state.drafts.length > 0
    if (isArabic) {
      return hasDraft
        ? 'جهّزت لك بوست كمسودة في الكارت اللي تحت. راجعه والوقت المقترح قبل النشر.'
        : 'جهّزت لك ملف في المخرجات. هتلاقيه في الكارت اللي تحت.'
    }
    return hasDraft
      ? 'I’ve prepared a post as a draft in the card below. Review it and the suggested timing before publishing.'
      : 'I’ve saved a document to your deliverables. You’ll find it in the card below.'
  }

  if (
    state.directorFailed ||
    runInfo?.status === 'partial' ||
    (runInfo?.stopReason && runInfo.stopReason !== 'finished')
  ) {
    return isArabic
      ? 'تعذّر إكمال المهمة حالياً بسبب انتهاء المهلة أو ضغط الخدمة. جرب مرة أخرى أو قسّم الطلب لخطوات أصغر.'
      : 'The task could not be completed right now due to a timeout or service limit. Please try again or break it into a smaller request.'
  }

  return isArabic
    ? 'تمام، خلصت. تحب نكمّل في إيه تاني؟'
    : 'All done. What would you like to do next?'
}

/** Extract the language hint from the latest user text in a message list. */
export function replyLanguageFromUserText(userText: string | null | undefined): boolean {
  return isArabicText(firstNonEmpty(userText))
}