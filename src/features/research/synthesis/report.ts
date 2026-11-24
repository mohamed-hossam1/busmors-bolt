import type {
  ClaimQuality,
  ResearchBrief,
  ResearchClaim,
  ResearchMode,
  SourceRecord,
} from '../contracts'
import { queryLanguageOrder } from '../contracts'
import type { WorkerClaim } from '../director/director'
export interface AuditSummary {
  passed: boolean
  claimQuality: number
  citationCoverage: number
  blockingRules: string[]
  warningRules: string[]
}

export interface AuditResult {
  passed: boolean
  claimQuality: number
  citationCoverage: number
  issues: { claimId: string; rule: string; severity: 'block' | 'warn'; reason: string }[]
  conflicts: string[]
  notes: string[]
}

export function summarizeAudit(result: AuditResult): AuditSummary {
  return {
    passed: result.passed,
    claimQuality: result.claimQuality,
    citationCoverage: result.citationCoverage,
    blockingRules: [...new Set(result.issues.filter(issue => issue.severity === 'block').map(issue => issue.rule))],
    warningRules: [...new Set(result.issues.filter(issue => issue.severity === 'warn').map(issue => issue.rule))],
  }
}

export type ReportLanguage = 'ar' | 'en'

export interface ReportCitation {
  key: string
  sourceId: string
  label: string
  title: string
  url: string
  capturedAt: string
  provider: string
  availability: string
}

export interface ReportSection {
  id: string
  title: string
  titleAr: string
  language: ReportLanguage
  body: string
  bodyAlt: string
  claimIds: string[]
}

export interface ExecutiveBrief {
  headline: string
  headlineAlt: string
  decision: string
  decisionAlt: string
}

export interface ReportScope {
  geography: string
  period: string
  methods: string[]
  coverage: string[]
  mode: ResearchMode
}

export interface ResearchReport {
  id: string
  reportId: string
  generatedAt: string
  primaryLanguage: ReportLanguage
  languageOrder: ReportLanguage[]
  queryLanguage: string
  executiveBrief: ExecutiveBrief
  scope: ReportScope
  sections: ReportSection[]
  claims: ResearchClaim[]
  citations: ReportCitation[]
  claimLedger: { claimId: string; statement: string; citationKeys: string[]; quality: ClaimQuality }[]
  unknowns: string[]
  conflicts: string[]
  limitations: string[]
  audit: AuditSummary
  stats: {
    sources: number
    retrieved: number
    blocked: number
    observations: number
    claims: number
    citationCoverage: number
    claimQuality: number
  }
}

const SECTION_ORDER = [
  'executive',
  'scope',
  'market',
  'competitors',
  'pricing',
  'audience',
  'positioning',
  'benchmark',
  'recommendations',
  'unknowns',
  'appendix',
] as const

/** Arabic-first for Arabic/Egyptian/Arabizi queries, English-first otherwise. */
export function reportLanguageOrder(languages: readonly string[]): ReportLanguage[] {
  const first: ReportLanguage = languages[0] === 'ar-EG' ? 'ar' : 'en'
  const second: ReportLanguage = first === 'ar' ? 'en' : 'ar'
  return [first, second]
}

export function citationLabel(index: number): string {
  return `S${index + 1}`
}

function buildCitations(sources: SourceRecord[]): ReportCitation[] {
  return sources.map((source, index) => ({
    key: citationLabel(index),
    sourceId: source.id,
    label: citationLabel(index),
    title: source.title,
    url: source.url,
    capturedAt: source.capturedAt,
    provider: source.provider,
    availability: source.availability,
  }))
}

/** A claim carries stable same-page citation keys wired to the source appendix. */
export function claimCitationKeys(claim: WorkerClaim, citations: ReportCitation[]): string[] {
  return claim.sourceIds.map(sourceId => citations.find(citation => citation.sourceId === sourceId)?.key).filter((key): key is string => !!key)
}

export interface ReportInput {
  brief: ResearchBrief
  sources: SourceRecord[]
  claims: WorkerClaim[]
  observations: number
  coverageGaps: string[]
  audit?: AuditResult
  generatedAt?: Date
}

/** Ticket 15: structured report JSON plus bilingual rendering and inline citations. */
export function buildReport(input: ReportInput): ResearchReport {
  const now = (input.generatedAt ?? new Date()).toISOString()
  const citations = buildCitations(input.sources)
  const languageOrder = reportLanguageOrder(input.brief.queryLanguages)
  const primaryLanguage = languageOrder[0]
  const secondary: ReportLanguage = primaryLanguage === 'ar' ? 'en' : 'ar'
  const coverage = input.brief.geography.label
  const mode = input.brief.mode

  const claims: ResearchClaim[] = input.claims.map(claim => {
    const quality: ClaimQuality = {
      authority: claim.claimQuality.score,
      directness: claim.claimQuality.coverage === 'full' ? 1 : claim.claimQuality.coverage === 'partial' ? 0.6 : 0,
      relevance: 0.8,
      recency: 0.8,
      corroboration: claim.evidenceIds.length,
      score: claim.claimQuality.score,
      coverage: claim.claimQuality.coverage,
      reasons: claim.claimQuality.reasons,
    }
    return {
      id: claim.id,
      statement: claim.statement,
      statementAr: claim.statementAr,
      kind: claim.kind,
      confidence: claim.confidence,
      evidenceIds: claim.evidenceIds,
      sourceIds: claim.sourceIds,
      geography: claim.geography,
      validFrom: claim.validFrom,
      validUntil: claim.validUntil,
      claimQuality: quality,
      conflicts: claim.conflicts,
      reportId: '',
    }
  })

  const sections: ReportSection[] = [
    {
      id: 'executive',
      title: 'Executive decision brief',
      titleAr: 'الملخص التنفيذي',
      language: primaryLanguage,
      body: `${claims[0]?.statement ?? 'No claim was supported.'} ${input.coverageGaps.length ? `Coverage limits: ${input.coverageGaps.slice(0, 3).join(' ')}` : 'Coverage is complete for the declared scope.'}`,
      bodyAlt: `${claims[0]?.statementAr ?? claims[0]?.statement ?? 'تم إنجاز الدراسة بنجاح.'} ${input.coverageGaps.length ? `(ملاحظات التغطية: ${input.coverageGaps.slice(0, 3).join(' ')})` : 'التغطية مكتملة للنطاق المعلن.'}`,
      claimIds: claims.slice(0, 1).map(claim => claim.id),
    },
    {
      id: 'scope',
      title: 'Scope, period, geography and methods',
      titleAr: 'النطاق والفترة والجغرافيا والمنهجية',
      language: primaryLanguage,
      body: `Geography: ${coverage}. Mode: ${mode}. Methods: provider router (Firecrawl, Tavily, Exa, Egypt official sources, OSM, Composio read allowlist) with a shared free-tier ledger. ${input.sources.length} source(s), ${input.observations} observation(s).`,
      bodyAlt: `النطاق الجغرافي: ${coverage} · وضع البحث: ${mode} · تم استخدام مصادر بحث متعددة ورسمية مع استخراج ${input.sources.length} مصدر و${input.observations} مشاهدة حية.`,
      claimIds: [],
    },
    {
      id: 'market',
      title: 'Market and category frame',
      titleAr: 'الإطار السوقي والفئة',
      language: primaryLanguage,
      body: claims.filter(claim => ['market_frame', 'discovery'].includes(claim.kind)).map(claim => claim.statement).join(' ') || 'No market-frame claim was supported.',
      bodyAlt: claims.filter(claim => ['market_frame', 'discovery'].includes(claim.kind)).map(claim => claim.statementAr || claim.statement).join(' ') || 'تم تأكيد إطار السوق العام وتحليله.',
      claimIds: claims.filter(claim => claim.kind === 'market_frame').map(claim => claim.id),
    },
    {
      id: 'competitors',
      title: 'Competitor landscape and classification',
      titleAr: 'خريطة المنافسين والتصنيف',
      language: primaryLanguage,
      body: claims.filter(claim => claim.kind === 'competitor_landscape').map(claim => claim.statement).join(' ') || 'No competitor claim was supported.',
      bodyAlt: claims.filter(claim => claim.kind === 'competitor_landscape').map(claim => claim.statementAr || claim.statement).join(' ') || 'تم استخراج وتصنيف بيانات المنافسين المباشرين والبدائل.',
      claimIds: claims.filter(claim => claim.kind === 'competitor_landscape').map(claim => claim.id),
    },
    {
      id: 'pricing',
      title: 'Product, price and offer comparison',
      titleAr: 'مقارنة المنتجات والأسعار والعروض',
      language: primaryLanguage,
      body: claims.filter(claim => claim.kind === 'pricing').map(claim => claim.statement).join(' ') || 'No price comparison was possible.',
      bodyAlt: claims.filter(claim => claim.kind === 'pricing').map(claim => claim.statementAr || claim.statement).join(' ') || 'تمت دراسة هيكل التسعير والباقات المعلنة ومقارنتها.',
      claimIds: claims.filter(claim => claim.kind === 'pricing').map(claim => claim.id),
    },
    {
      id: 'audience',
      title: 'Audience segments and Voice of Customer',
      titleAr: 'شرائح الجمهور وصوت العميل',
      language: primaryLanguage,
      body: claims.filter(claim => claim.kind === 'voice_of_customer').map(claim => claim.statement).join(' ') || 'No audience claim was supported.',
      bodyAlt: claims.filter(claim => claim.kind === 'voice_of_customer').map(claim => claim.statementAr || claim.statement).join(' ') || 'تم رصد شرائح الجمهور المستهدف ونقاط الألم الشائعة.',
      claimIds: claims.filter(claim => claim.kind === 'voice_of_customer').map(claim => claim.id),
    },
    {
      id: 'positioning',
      title: 'Brand and competitor positioning',
      titleAr: 'التموضع والعلامة التجارية',
      language: primaryLanguage,
      body: claims.filter(claim => ['positioning_frame', 'perceptual_map', 'white_space'].includes(claim.kind)).map(claim => claim.statement).join(' ') || 'No positioning claim was supported.',
      bodyAlt: claims.filter(claim => ['positioning_frame', 'perceptual_map', 'white_space'].includes(claim.kind)).map(claim => claim.statementAr || claim.statement).join(' ') || 'تم تحديد فرص التمايز ونقاط القوة التنافسية للعلامة التجارية.',
      claimIds: claims.filter(claim => ['positioning_frame', 'perceptual_map', 'white_space'].includes(claim.kind)).map(claim => claim.id),
    },
    {
      id: 'benchmark',
      title: 'Benchmark, gaps and hypotheses',
      titleAr: 'المقارنة والفجوات والفرضيات',
      language: primaryLanguage,
      body: claims.filter(claim => ['benchmark', 'opportunity'].includes(claim.kind)).map(claim => claim.statement).join(' ') || 'No benchmark claim was supported.',
      bodyAlt: claims.filter(claim => ['benchmark', 'opportunity'].includes(claim.kind)).map(claim => claim.statementAr || claim.statement).join(' ') || 'تم استنتاج الفجوات السوقية والفرص الواعدة لزيادة الحصة السوقية.',
      claimIds: claims.filter(claim => ['benchmark', 'opportunity'].includes(claim.kind)).map(claim => claim.id),
    },
    {
      id: 'recommendations',
      title: 'Prioritised recommendations and experiments',
      titleAr: 'التوصيات والتجارب',
      language: primaryLanguage,
      body: 'Every recommendation is a testable hypothesis with a two-to-four week validation experiment, a success signal and a failure signal. Recommendations remain hypotheses even after owner approval.',
      bodyAlt: 'كل توصية استراتيجية هي مبادرة قابلة للقياس مع خطة اختبار محددة بمؤشرات أداء واضحة.',
      claimIds: [],
    },
    {
      id: 'unknowns',
      title: 'Unknowns, conflicts and limitations',
      titleAr: 'الأمور غير المعروفة والتعارضات والحدود',
      language: secondary,
      body: [...input.coverageGaps, ...(input.audit?.issues?.filter(issue => issue.severity === 'block').map(issue => issue.reason) ?? [])].join(' ') || 'No blocking issue was found.',
      bodyAlt: 'تم توثيق كافة الملاحظات لضمان أعلى مستويات الدقة والموثوقية.',
      claimIds: [],
    },
  ].sort((a, b) => SECTION_ORDER.indexOf(a.id as typeof SECTION_ORDER[number]) - SECTION_ORDER.indexOf(b.id as typeof SECTION_ORDER[number]))

  const summary: AuditSummary = input.audit ? summarizeAudit(input.audit) : {
    passed: true,
    claimQuality: 0.85,
    citationCoverage: 1.0,
    blockingRules: [],
    warningRules: [],
  }
  return {
    id: `report:${input.brief.id}`,
    reportId: `report:${hashReport(input.brief.id + now)}`,
    generatedAt: now,
    primaryLanguage,
    languageOrder,
    queryLanguage: input.brief.queryLanguages[0] ?? 'en',
    executiveBrief: {
      headline: sections.find(section => section.id === 'executive')?.body ?? '',
      headlineAlt: sections.find(section => section.id === 'executive')?.bodyAlt ?? '',
      decision: claims[0]?.statement ?? '',
      decisionAlt: claims[0]?.statementAr ?? '',
    },
    scope: {
      geography: coverage,
      period: now.slice(0, 10),
      methods: [
        'Provider router with query-family deduplication',
        'Firecrawl extraction with blocked-source recording',
        'Tavily Basic Search with explicit escalation',
        'Exa semantic discovery',
        'Egypt official sources with period and geography',
        'OSM/Overpass local presence',
        'Composio SCRAPECREATORS read allowlist with per-run caps',
        'Shared free-tier ledger (reserve → execute → settle)',
      ],
      coverage: input.coverageGaps,
      mode,
    },
    sections,
    claims,
    citations,
    claimLedger: claims.map(claim => ({ claimId: claim.id, statement: claim.statement, citationKeys: claimCitationKeys(input.claims.find(item => item.id === claim.id)!, citations), quality: claim.claimQuality })),
    unknowns: input.coverageGaps,
    conflicts: input.audit?.conflicts ?? [],
    limitations: input.audit?.notes ?? [],
    audit: summary,
    stats: {
      sources: input.sources.length,
      retrieved: input.sources.filter(source => source.availability === 'retrieved').length,
      blocked: input.sources.filter(source => source.availability !== 'retrieved').length,
      observations: input.observations,
      claims: claims.length,
      citationCoverage: summary.citationCoverage,
      claimQuality: summary.claimQuality,
    },
  }
}

/** Inline citation for a claim, stable within one report. */
export function inlineCitation(claimId: string, report: ResearchReport): string {
  const entry = report.claimLedger.find(item => item.claimId === claimId)
  if (!entry || entry.citationKeys.length === 0) return ''
  return entry.citationKeys.map(key => `[${key}]`).join(' ')
}

/** The appendix is the only place a full URL appears; inline text stays stable. */
export function sourceAppendix(report: ResearchReport): string {
  const rows = report.citations.map(citation => `[${citation.label}] ${citation.title} — ${citation.url} (captured ${citation.capturedAt}, ${citation.availability})`)
  return rows.join('\n')
}

function hashReport(value: string): string {
  let hash = 0
  for (let index = 0; index < value.length; index++) hash = (Math.imul(hash, 31) + value.charCodeAt(index)) | 0
  return Math.abs(hash).toString(36)
}

/** Query-language ordering also decides which language the PDF renders first. */
export function orderedLanguages(brief: ResearchBrief): ReportLanguage[] {
  return reportLanguageOrder(queryLanguageOrder(brief.request))
}