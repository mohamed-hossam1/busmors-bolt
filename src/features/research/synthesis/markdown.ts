import type { ResearchReport } from './report'

const SECTION_HEADINGS: Readonly<Record<string, string>> = {
  market: '## Market',
  competitors: '## Competitors',
  pricing: '## Pricing',
  audience: '## Audience',
  positioning: '## Positioning',
  benchmark: '## Benchmark',
  recommendations: '## Recommendations',
  unknowns: '## Unknowns and Limitations',
  appendix: '## Appendix',
}

/** Sections already represented by the document header / scope line. */
const HEADER_SECTIONS = new Set(['executive', 'scope'])

/**
 * Human-readable bilingual Markdown for the research report document. This is
 * what the chat renders and the owner downloads; the structured JSON is still
 * persisted separately (reportJsonPath) for programmatic use.
 */
export function formatReportMarkdown(report: ResearchReport): string {
  const lines: string[] = []

  const heading = report.executiveBrief.headlineAlt || report.executiveBrief.headline || 'Marketing Research Report'
  lines.push(`# ${heading}`)
  lines.push('')

  const summary = report.executiveBrief.decisionAlt || report.executiveBrief.decision
  if (summary && summary.trim()) {
    lines.push(summary.trim())
    lines.push('')
  }

  lines.push(`**Geography:** ${report.scope.geography} · **Period:** ${report.scope.period} · **Mode:** ${report.scope.mode}`)
  lines.push('')

  for (const section of report.sections) {
    if (HEADER_SECTIONS.has(section.id)) continue
    const body = (section.bodyAlt || section.body || '').trim()
    if (!body) continue
    lines.push(SECTION_HEADINGS[section.id] ?? `## ${section.titleAr || section.title}`)
    lines.push('')
    for (const paragraph of body.split(/\n+/)) {
      const trimmed = paragraph.trim()
      if (trimmed) lines.push(trimmed)
    }
    lines.push('')
  }

  if (report.citations.length > 0) {
    lines.push('## Sources')
    lines.push('')
    for (const citation of report.citations) {
      lines.push(`- [${citation.label}] ${citation.title} — ${citation.url} (captured ${citation.capturedAt}, ${citation.availability})`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}