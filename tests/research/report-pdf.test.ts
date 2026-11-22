import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReport, inlineCitation, reportLanguageOrder, sourceAppendix } from '../../src/features/research/synthesis/report'
import { renderReportHtml, evaluatePdfChecks, escapeHtml, pdfFailureReason, pdfPassed } from '../../src/features/research/deliverable/pdf'
import type { ResearchBrief, SourceRecord } from '../../src/features/research/contracts'
import type { AuditResult } from '../../src/features/research/auditor/auditor'

const source: SourceRecord = {
  id: 's1', url: 'https://a.example/p?utm_source=x', canonicalUrl: 'https://a.example/p', title: 'Cairo Ceramic Studio', sourceType: 'website',
  provider: 'firecrawl', toolAction: 'scrape', toolkitVersion: '1', capturedAt: '2026-10-01T00:00:00Z', publishedAt: null,
  excerpt: 'Kintsugi repair EGP 1,200 including VAT.', contentHash: 'abc', availability: 'retrieved', storagePolicy: 'workspace',
  usage: { calls: 1, pages: 1, tokens: 0, credits: 1 }, credits: 1, market: 'EG', sector: 'construction', authority: 'Cairo Ceramic Studio', authorityScore: 0.6, geography: 'Cairo', period: '2026-10', blockedReason: null,
}

const audit: AuditResult = {
  passed: true,
  claimQuality: 0.8,
  citationCoverage: 1,
  issues: [],
  claims: [],
  conflicts: [],
  notes: ['Missing is not zero.'],
}

function brief(mode: 'quick' | 'standard' | 'deep' = 'standard', request = 'Research ceramic repair في القاهرة'): ResearchBrief {
  return {
    id: 'brief:1',
    mode,
    request,
    businessProfile: { name: 'Orbit', sector: 'construction', description: 'Kintsugi repair', governorates: ['Cairo'], channels: ['facebook'], website: null, audience: 'owners' },
    category: { label: 'ceramic repair', labelAr: 'تصليح سيراميك', subcategories: [], substitutes: [], doNothing: 'Do nothing' },
    queryLanguages: request.includes('القاهرة') ? ['ar-EG', 'en'] : ['en', 'ar-EG'],
    geography: { label: 'Egypt — Cairo', governorates: ['Cairo'], egyptWide: false },
    tracks: ['market_demand'],
    budget: { calls: 24, pages: 18, tokens: 24000, seconds: 150, credits: 24 },
    stopRules: { maxQueryRounds: 2, minNewEntityPercent: 0.05, entityTarget: 18 },
    createdAt: '2026-10-01T00:00:00Z',
  }
}

function report(mode: 'quick' | 'standard' | 'deep' = 'standard', request?: string) {
  return buildReport({
    brief: brief(mode, request),
    sources: [source],
    claims: [{ id: 'c1', statement: 'Two repair shops serve Cairo.', statementAr: 'محلين بيصلحوا السيراميك في القاهرة.', kind: 'market_frame', confidence: 'supported', evidenceIds: ['e1'], sourceIds: ['s1'], geography: 'Cairo', validFrom: null, validUntil: null, claimQuality: { score: 0.8, coverage: 'full', reasons: [] }, conflicts: [] }],
    observations: 1,
    coverageGaps: ['Coverage limited to Cairo.'],
    audit,
  })
}

test('report: Arabic-first queries put Arabic first and keep a stable citation label', () => {
  assert.deepEqual(reportLanguageOrder(['ar-EG', 'en']), ['ar', 'en'])
  assert.deepEqual(reportLanguageOrder(['en', 'ar-EG']), ['en', 'ar'])
  const ar = report('standard', 'Research ceramic repair في القاهرة')
  assert.equal(ar.primaryLanguage, 'ar')
  assert.equal(ar.citations[0].key, 'S1')
  assert.equal(ar.citations[0].url, 'https://a.example/p?utm_source=x')
  assert.match(inlineCitation('c1', ar), /\[S1\]/)
  assert.match(sourceAppendix(ar), /Cairo Ceramic Studio/)
})

test('report: sections are ordered and unknown limits stay visible', () => {
  const r = report()
  const order = r.sections.map(section => section.id)
  assert.equal(order[0], 'executive')
  assert.equal(order[order.length - 1], 'unknowns')
  assert.ok(r.scope.coverage.includes('Coverage limited to Cairo.'))
  assert.equal(r.stats.citationCoverage, 1)
  assert.equal(r.audit.passed, true)
})

test('pdf html: RTL for Arabic, LTR for English, citations are links', () => {
  const ar = renderReportHtml(report('standard', 'Research ceramic repair في القاهرة'))
  assert.match(ar, /dir="rtl"/)
  assert.match(ar, /lang="ar-EG"/)
  assert.match(ar, /<a class="cite" href="https:\/\/a\.example\/p\?utm_source=x">\[S1\]<\/a>/)
  const en = renderReportHtml(report())
  assert.match(en, /dir="ltr"/)
  assert.match(en, /<section dir="ltr"/)
})

test('pdf html: text is escaped', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
})

test('pdf checks: openable, page count, metadata and text extraction', () => {
  const r = report()
  const html = renderReportHtml(r)
  const checks = evaluatePdfChecks({
    pdf: Buffer.from('%PDF-1.4\n1 0 obj\n/Type /Page\n2 0 obj\n/Type /Page\n%%EOF'),
    info: { pageCount: 2, metadata: { Title: 'Busmora Marketing Research Report' }, text: html.replace(/<[^>]+>/g, ' '), pngs: ['/tmp/page-1.png', '/tmp/page-2.png'] },
    report: r,
    html,
  })
  assert.equal(checks.find(check => check.name === 'openable')?.passed, true)
  assert.equal(checks.find(check => check.name === 'page_count')?.passed, true)
  assert.equal(checks.find(check => check.name === 'metadata')?.passed, true)
  assert.equal(checks.find(check => check.name === 'clickable_citations')?.passed, true)
  assert.equal(pdfPassed(checks), true)
  assert.equal(pdfFailureReason({ path: '/x.pdf', pageCount: 2, metadata: {}, checks, passed: true }), null)
})

test('pdf checks: a missing render or a wrong page count fails the gate', () => {
  const r = report()
  const html = renderReportHtml(r)
  const checks = evaluatePdfChecks({
    pdf: Buffer.from('%PDF-1.4\n/Type /Page\n/Type /Page'),
    info: { pageCount: 5, metadata: {}, text: '', pngs: [] },
    report: r,
    html,
  })
  assert.equal(checks.find(check => check.name === 'page_count')?.passed, false)
  assert.equal(checks.find(check => check.name === 'visual_qa')?.passed, false)
  assert.equal(pdfPassed(checks), false)
  assert.ok(pdfFailureReason({ path: '/x.pdf', pageCount: 5, metadata: {}, checks, passed: false }))
})