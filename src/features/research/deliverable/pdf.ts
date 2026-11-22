import type { PdfArtifact, PdfCheck } from '../contracts'
import type { ResearchReport } from '../synthesis/report'

/** Chromium print-to-PDF, injected so the renderer stays testable. */
export interface PdfRenderTransport {
  print(html: string, options: { pdfPath: string; title: string }): Promise<void>
}

export interface PdfInspect {
  pageCount: number
  metadata: Record<string, string>
  text: string
  /** One PNG per rendered page; an empty array means the renderer is unavailable. */
  pngs: string[]
}

export interface PdfInspectTransport {
  inspect(pdfPath: string, options: { outDir: string }): Promise<PdfInspect>
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ESCAPES[char])
}

function dir(language: 'ar' | 'en'): 'rtl' | 'ltr' {
  return language === 'ar' ? 'rtl' : 'ltr'
}

function sectionHtml(report: ResearchReport, index: number): string {
  const language = report.languageOrder[index % report.languageOrder.length]
  const title = language === 'ar' ? sectionTitleAr(report, index) : report.sections[index].title
  const body = language === 'ar' ? report.sections[index].bodyAlt || report.sections[index].body : report.sections[index].body
  const citations = report.claimLedger
    .filter(entry => report.sections[index].claimIds.includes(entry.claimId))
    .flatMap(entry => entry.citationKeys)
  const links = [...new Set(citations)].map(key => {
    const citation = report.citations.find(item => item.key === key)
    return citation ? `<a class="cite" href="${escapeHtml(citation.url)}">[${escapeHtml(key)}]</a>` : ''
  }).join(' ')
  return `<section dir="${dir(language)}" lang="${language === 'ar' ? 'ar-EG' : 'en'}">
  <h2>${escapeHtml(title)}</h2>
  <p>${escapeHtml(body)}</p>
  ${links ? `<p class="citations">${links}</p>` : ''}
</section>`
}

function sectionTitleAr(report: ResearchReport, index: number): string {
  return report.sections[index].titleAr || report.sections[index].title
}

/** A bilingual print template: RTL/LTR per block, page numbers, clickable citations. */
export function renderReportHtml(report: ResearchReport, options: { title?: string } = {}): string {
  const primary = report.primaryLanguage
  const lang = primary === 'ar' ? 'ar-EG' : 'en'
  const title = options.title ?? 'Busmora Marketing Research Report'
  const sections = report.sections.map((section, index) => sectionHtml(report, index)).join('\n')
  const claims = report.claimLedger.map(entry => {
    const keys = entry.citationKeys.map(key => `[${key}]`).join(' ')
    return `<tr dir="${dir(primary)}"><td>${escapeHtml(entry.claimId)}</td><td>${escapeHtml(entry.statement)}</td><td>${escapeHtml(keys)}</td><td>${entry.quality.score}</td></tr>`
  }).join('\n')
  const appendix = report.citations.map(citation => `<li dir="ltr"><a href="${escapeHtml(citation.url)}">[${escapeHtml(citation.label)}]</a> ${escapeHtml(citation.title)} — ${escapeHtml(citation.capturedAt)} (${escapeHtml(citation.availability)})</li>`).join('\n')
  const unknowns = [...report.unknowns, ...report.conflicts].map(item => `<li>${escapeHtml(item)}</li>`).join('\n')

  return `<!doctype html>
<html lang="${lang}" dir="${dir(primary)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 18mm 15mm 20mm 15mm; }
  body { font-family: "Noto Naskh Arabic", "Amiri", "Segoe UI", Tahoma, sans-serif; font-size: 10.5pt; line-height: 1.55; color: #111827; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 4mm 0; }
  h2 { font-size: 13pt; margin: 6mm 0 2mm 0; color: #0f172a; }
  p { margin: 0 0 2.5mm 0; }
  section { page-break-inside: avoid; break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 1.6mm 2mm; text-align: start; vertical-align: top; }
  tr { page-break-inside: avoid; }
  a { color: #0f766e; text-decoration: none; word-break: break-all; }
  .meta { font-size: 9pt; color: #475569; margin-bottom: 5mm; }
  .citations { font-size: 8.5pt; color: #0f766e; }
  ol, ul { margin: 0 0 2mm 5mm; padding: 0; }
  .footer { font-size: 8pt; color: #64748b; margin-top: 6mm; border-top: 1px solid #e2e8f0; padding-top: 2mm; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(report.scope.geography)} · ${escapeHtml(report.scope.period)} · mode ${escapeHtml(report.scope.mode)} · generated ${escapeHtml(report.generatedAt)}</p>
${sections}
<h2>${primary === 'ar' ? 'سجل الادعاءات' : 'Claim ledger'}</h2>
<table dir="ltr">
<thead><tr><th>Claim</th><th>Statement</th><th>Citations</th><th>Quality</th></tr></thead>
<tbody>
${claims}
</tbody>
</table>
<h2>${primary === 'ar' ? 'حدود التغطية والنزاعات' : 'Coverage limits and conflicts'}</h2>
<ul>${unknowns || '<li>None recorded.</li>'}</ul>
<h2>${primary === 'ar' ? 'ملحق المصادر' : 'Source appendix'}</h2>
<ol>${appendix}</ol>
<p class="footer">${escapeHtml(title)} · ${report.stats.sources} source(s) · citation coverage ${(report.stats.citationCoverage * 100).toFixed(0)}% · claim quality ${report.stats.claimQuality.toFixed(2)}</p>
</body>
</html>`
}

/** Automated PDF QA: openable, page count, metadata, text fidelity, render check. */
export function evaluatePdfChecks(input: {
  pdf: Buffer
  info: PdfInspect
  report: ResearchReport
  html: string
}): PdfCheck[] {
  const checks: PdfCheck[] = []
  const header = input.pdf.subarray(0, 5).toString('latin1')
  checks.push({ name: 'openable', passed: header === '%PDF-', detail: `Header: ${header || '(empty)'}` })

  const pageMarkers = (input.pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  const pageCountOk = input.info.pageCount > 0 && (pageMarkers === 0 || pageMarkers === input.info.pageCount)
  checks.push({ name: 'page_count', passed: pageCountOk, detail: `pdfinfo pages=${input.info.pageCount}, page markers=${pageMarkers}` })

  const title = input.info.metadata.Title ?? input.info.metadata.title ?? ''
  checks.push({ name: 'metadata', passed: title.trim().length > 0, detail: `Title: ${title || '(missing)'}` })

  const expectedArabic = (input.html.match(/[\u0600-\u06FF]/g) ?? []).length
  const extractedArabic = (input.info.text.match(/[\u0600-\u06FF]/g) ?? []).length
  const arabicRatio = expectedArabic === 0 ? 1 : extractedArabic / expectedArabic
  checks.push({ name: 'text_arabic', passed: arabicRatio >= 0.8, detail: `Arabic glyph coverage ${(arabicRatio * 100).toFixed(0)}% of the source HTML` })

  const sample = input.report.claims[0]?.statement.split(/\s+/).slice(0, 3).join(' ') ?? ''
  const foundSample = sample.length > 8 && input.info.text.toLowerCase().includes(sample.toLowerCase())
  checks.push({ name: 'text_extraction', passed: foundSample || input.report.claims.length === 0, detail: foundSample ? `Extracted sample: ${sample}` : `Sample not found: ${sample}` })

  const citations = (input.html.match(/<a class="cite"/g) ?? []).length
  checks.push({ name: 'clickable_citations', passed: citations > 0 || input.report.citations.length === 0, detail: `${citations} inline citation link(s)` })

  if (input.info.pngs.length === 0) {
    checks.push({ name: 'visual_qa', passed: false, detail: 'No PNG render was produced; visual QA could not run.' })
  } else {
    const renderedAll = input.info.pngs.length >= input.info.pageCount
    checks.push({ name: 'visual_qa', passed: renderedAll && arabicRatio >= 0.8, detail: `${input.info.pngs.length} PNG page(s) rendered for ${input.info.pageCount} page(s); Arabic glyph fidelity ${(arabicRatio * 100).toFixed(0)}%.` })
  }
  return checks
}

export function pdfPassed(checks: PdfCheck[]): boolean {
  return checks.every(check => check.passed)
}

/** Build the PDF, then gate completion on the automated checks. */
export async function buildPdfArtifact(input: {
  report: ResearchReport
  pdfPath: string
  outDir: string
  render: PdfRenderTransport
  inspect: PdfInspectTransport
  title?: string
}): Promise<{ artifact: PdfArtifact; html: string }> {
  const html = renderReportHtml(input.report, { title: input.title })
  await input.render.print(html, { pdfPath: input.pdfPath, title: input.title ?? 'Busmora Marketing Research Report' })
  const { readFile } = await import('node:fs/promises')
  const pdf = await readFile(input.pdfPath)
  const info = await input.inspect.inspect(input.pdfPath, { outDir: input.outDir })
  const checks = evaluatePdfChecks({ pdf, info, report: input.report, html })
  return {
    html,
    artifact: {
      path: input.pdfPath,
      pageCount: info.pageCount,
      metadata: info.metadata,
      checks,
      passed: pdfPassed(checks),
    },
  }
}

/** Rendered-page text checks are recorded so a human can re-verify visually. */
export function visualReviewNote(checks: PdfCheck[]): string {
  const visual = checks.find(check => check.name === 'visual_qa')
  return visual ? `Visual QA: ${visual.detail}` : 'Visual QA: not run.'
}

export function pdfFailureReason(artifact: PdfArtifact): string | null {
  const failed = artifact.checks.filter(check => !check.passed)
  return failed.length ? failed.map(check => `${check.name}: ${check.detail}`).join(' ') : null
}