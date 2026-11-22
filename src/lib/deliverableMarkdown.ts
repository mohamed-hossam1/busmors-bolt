import type { TaskOutput } from '../features/tasks/types'
import { formatWorkspaceTime } from './region'

// Deterministic document builders for saved Deliverables. Pure: no AI, no I/O.

/** Read-only snapshot of the drafts at save time; the live posts stay in Calendar & Publishing. */
export function postsMarkdown(posts: TaskOutput['posts'], timezone: string): string {
  const sections = posts.map((post, index) => {
    const lines = [`## Post ${index + 1}`, post.caption, '']
    if (post.hashtags.trim()) lines.push(post.hashtags.trim(), '')
    if (post.proposedAt) lines.push(`*Proposed time:* ${formatWorkspaceTime(post.proposedAt, timezone)}`, '')
    lines.push('*Status:* Draft. Review and approve in Calendar & Publishing.')
    return lines.join('\n')
  })
  return ['# Post drafts', '', '_Snapshot at save time. The live posts are in Calendar & Publishing._', '', ...sections.flatMap((section) => [section, ''])].join('\n').trimEnd()
}

/** Markdown table of proposed times, one row per post. */
export function scheduleTable(posts: TaskOutput['posts'], timezone: string): string {
  const rows = posts.map((post, index) => {
    const time = post.proposedAt ? formatWorkspaceTime(post.proposedAt, timezone) : 'Not set'
    const firstLine = (post.caption.split(/\r?\n/).find((line) => line.trim()) ?? '').trim().replace(/\|/g, '\\|')
    return `| ${index + 1} | ${time} | ${firstLine} |`
  })
  return ['## Schedule', '', '| # | Proposed time | First line of caption |', '|---|---|---|', ...rows].join('\n')
}
