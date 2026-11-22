import type { Deliverable } from './types'
import type { TaskIntent } from '../features/tasks/types'

export type DeliverableType = Deliverable['type']

/**
 * Maps a finished task to the Deliverables section it belongs to.
 *
 * | Intent                                   | Offer?                              | Section (`type`)                          | Document content                                   |
 * |------------------------------------------|-------------------------------------|-------------------------------------------|----------------------------------------------------|
 * | simple_answer (mode reply and task)      | Only if isSubstantialReply(reply)   | general                                   | The reply markdown; title = replyTitle(...)        |
 * | content_creation                         | Yes                                 | content_posts                             | postsMarkdown(posts, timezone)                     |
 * | campaign_planning, brief + ≥1 proposed   | Yes                                 | content_calendar                          | Brief markdown + scheduleTable(posts, timezone)    |
 * | campaign_planning, brief, no times       | Yes                                 | general                                   | Brief markdown                                     |
 * | campaign_planning without a brief        | No offer                            | —                                         | (Posts are still saved as drafts.)                 |
 * | performance_diagnosis                    | Yes                                 | performance_diagnosis                     | The diagnosis markdown                             |
 * | marketing_research                       | Saved by save_research_result       | research_report                           | The research report (auto-saved with its sources)  |
 */
export function sectionForTask(intent: TaskIntent, postsWithProposedTimes: number): DeliverableType {
  switch (intent) {
    case 'marketing_research': return 'research_report' // research saves its own deliverable via save_research_result
    case 'performance_diagnosis': return 'performance_diagnosis'
    case 'campaign_planning': return postsWithProposedTimes > 0 ? 'content_calendar' : 'general'
    case 'content_creation': return 'content_posts'
    case 'simple_answer': return 'general' // only offered when isSubstantialReply() is true
  }
}

/** A plain chat reply is offered for saving only when it is long-form. */
export function isSubstantialReply(text: string): boolean {
  const t = text.trim()
  const listItems = t.match(/^\s*(?:[-*]|\d+[.)])\s/gm)?.length ?? 0
  return t.length >= 900 || /^#{1,3}\s/m.test(t) || listItems >= 5
}

/** Title for a saved chat reply: its first markdown heading, else the first 80 characters of the request. */
export function replyTitle(reply: string, request: string): string {
  const heading = reply.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim()
  return (heading || request.trim().slice(0, 80) || 'Director answer').slice(0, 200)
}
