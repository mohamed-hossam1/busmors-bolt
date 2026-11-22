import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessProfile, ResearchBrief, ResearchMode, ResearchRunResult } from '../../features/research/contracts'
import { emptyUsage } from '../../features/research/contracts'
import { budgetFor } from '../../features/research/policy'
import { buildBrief } from '../../features/research/director/brief'
import { ResearchDirector, createStubSubagent, type Subagent } from '../../features/research/director/director'
import { FreeTierLedger, InsufficientAllowanceError } from '../../features/research/ledger/ledger'
import { ProviderRouter } from '../../features/research/providers/router'
import { createTavilyProvider, createExaProvider } from '../../features/research/providers/search'
import { createFirecrawlProvider } from '../../features/research/providers/firecrawl'
import { createEgyptOfficialProvider } from '../../features/research/providers/egypt-official'
import { createOsmProvider } from '../../features/research/providers/osm'
import { createComposioProvider } from '../../features/research/providers/composio'
import { auditClaims } from '../../features/research/auditor/auditor'
import { buildReport, type ResearchReport } from '../../features/research/synthesis/report'
import { buildPdfArtifact, pdfFailureReason } from '../../features/research/deliverable/pdf'
import { analyzeClaims } from '../../features/research/brain/proposals'
import { createMarketScout } from '../../features/research/agents/market-scout'
import { createCompetitorIntelligence } from '../../features/research/agents/competitor-intelligence'
import { createAudienceIntelligence } from '../../features/research/agents/audience-intelligence'
import { createBrandPositioning } from '../../features/research/agents/brand-positioning'
import { createBenchmarkStrategy } from '../../features/research/agents/benchmark-strategy'
import { ResearchStorageError, createLedgerBackend, createEventSink, loadAllowance, saveResearchResult, storeResearchProposals, type SavedResearch } from './storage'
import { createPdfInspector, createPdfRenderer } from './pdf'
import {
  composioInstantPrice,
  composioRun,
  exaSearch,
  firecrawlScrape,
  officialPage,
  osmNearby,
  tavilySearch,
} from './providers'
import type { RouterProviders } from '../../features/research/providers/router'
import type { ExecutionTask } from '../../features/tasks/types'

/** Build the real provider set from server-side environment keys. */
export function createRouterProviders(): RouterProviders {
  return {
    firecrawl: createFirecrawlProvider({ scrape: firecrawlScrape }),
    tavily: createTavilyProvider({ search: tavilySearch }),
    exa: createExaProvider({ search: exaSearch }),
    osm: createOsmProvider({ nearby: osmNearby }),
    egypt_official: createEgyptOfficialProvider({ fetchPage: officialPage }),
    composio: createComposioProvider({ run: composioRun, instantPrice: composioInstantPrice }),
  }
}

/** Every research worker, each with its own Egyptian SKILL.md. */
export function createResearchWorkers(options: { authorizedGaps?: string[] } = {}): Subagent[] {
  const workers: Subagent[] = [
    createMarketScout(),
    createCompetitorIntelligence(),
    createAudienceIntelligence(),
    createBrandPositioning(),
    createBenchmarkStrategy({ authorizedGaps: options.authorizedGaps }),
  ]
  return workers
}

export interface ResearchRunnerOptions {
  client: SupabaseClient
  task: ExecutionTask
  signal: AbortSignal
  profile: BusinessProfile
  mode?: ResearchMode
  /** Injected for tests; defaults to the real server transports. */
  providers?: RouterProviders
  includeStubs?: boolean
  authorizedGaps?: string[]
}

export interface ResearchRunnerResult {
  result: ResearchRunResult
  report: ResearchReport | null
  saved: SavedResearch | null
  blocked: boolean
  blockingReasons: string[]
}

/**
 * Runs the whole marketing research pipeline for one task attempt:
 * brief → director → auditor → synthesis → PDF → pending Brain proposals.
 */
export async function runMarketingResearch(input: ResearchRunnerOptions): Promise<ResearchRunnerResult> {
  const { client, task, signal } = input
  const mode: ResearchMode = input.mode ?? (task.research_mode as ResearchMode | null) ?? 'standard'
  const budget = budgetFor(mode)

  const modeResult = await client.rpc('set_research_mode', { p_task_id: task.id, p_run_id: task.run_id, p_mode: mode })
  if (modeResult.error) throw new ResearchStorageError(modeResult.error.code ?? 'STORAGE_ERROR', modeResult.error.message)

  const allowance = await loadAllowance(client, budget)
  const ledger = new FreeTierLedger(createLedgerBackend(client), {
    calls: Math.min(budget.calls, allowance.calls),
    pages: Math.min(budget.pages, allowance.pages),
    tokens: Math.min(budget.tokens, allowance.tokens),
    credits: Math.min(budget.credits, allowance.credits),
    seconds: budget.seconds,
  }, task.id)

  const sink = createEventSink(client, task.id, task.run_id!)
  const router = new ProviderRouter(ledger, input.providers ?? createRouterProviders(), task.id)
  const brief = buildBrief({ request: task.user_request, mode, profile: input.profile })
  const workers = input.includeStubs
    ? brief.tracks.map(track => createStubSubagent(track))
    : createResearchWorkers({ authorizedGaps: input.authorizedGaps })
  const director = new ResearchDirector({ ledger, router, workers, sink })

  let directorResult
  try {
    directorResult = await director.run({ brief, request: task.user_request, mode, profile: input.profile, signal })
  } catch (error) {
    if (error instanceof InsufficientAllowanceError) {
      return blockedResult(brief, 'The free-tier allowance was exhausted before any evidence was retrieved. No credits were purchased.', error)
    }
    throw error
  }

  const firstAudit = auditClaims({
    claims: directorResult.claims,
    sources: directorResult.sources,
    observations: directorResult.observations,
    entities: directorResult.entities,
  })

  // A blocked claim is never published as a finding; it moves into coverage gaps.
  const blockedIds = new Set(firstAudit.claims.filter(claim => claim.verdict === 'block').map(claim => claim.claimId))
  const publishable = directorResult.claims.filter(claim => !blockedIds.has(claim.id))
  const cited = publishable.filter(claim => claim.kind !== 'method' && claim.evidenceIds.length > 0)
  const coverageGaps = [
    ...directorResult.artifacts.coverageGaps,
    ...firstAudit.issues.filter(issue => issue.severity === 'block').map(issue => `Not published: ${issue.reason}`),
  ]

  if (cited.length === 0) {
    return {
      result: {
        reply: `No finding survived the evidence audit, so no report was published. Blocking issues: ${[...new Set(firstAudit.issues.filter(issue => issue.severity === 'block').map(issue => issue.reason))].join(' ')}`,
        partial: true,
        document: { title: 'Research draft blocked by evidence audit', content: JSON.stringify({ blocking: firstAudit.issues.filter(issue => issue.severity === 'block') }).slice(0, 60000), type: 'research_report' },
        research: { ...directorResult.artifacts, reportId: '', coverageGaps, pdf: null, partial: true },
      },
      report: null,
      saved: null,
      blocked: true,
      blockingReasons: [...new Set(firstAudit.issues.filter(issue => issue.severity === 'block').map(issue => `${issue.rule}: ${issue.reason}`))],
    }
  }

  const audit = auditClaims({
    claims: publishable,
    sources: directorResult.sources,
    observations: directorResult.observations,
    entities: directorResult.entities,
  })

  await sink.append({
    instanceId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    parentInstanceId: null,
    type: 'agent_completed',
    agentId: 'evidence_auditor',
    agentRole: 'auditor',
    label: 'Audit the evidence',
    status: audit.passed ? 'completed' : 'partial',
    publicMessage: `${publishable.length} claim(s) audited; ${blockedIds.size} blocked; citation coverage ${(audit.citationCoverage * 100).toFixed(0)}%.`,
    parametersRedacted: { blockingRules: [...new Set(audit.issues.filter(issue => issue.severity === 'block').map(issue => issue.rule))] },
    sourceIds: [],
    consumption: emptyUsage(),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    failureReason: null,
  })

  const report = buildReport({
    brief: directorResult.brief,
    sources: directorResult.sources,
    claims: publishable,
    observations: directorResult.observations.length,
    coverageGaps,
    audit,
  })

  const reportDir = process.env.RESEARCH_REPORT_DIR ?? '/tmp/busmora-reports'
  let reportJsonPath = ''
  let reportHtmlPath = ''
  try {
    await mkdir(reportDir, { recursive: true })
    reportJsonPath = join(reportDir, `${report.reportId}.json`)
    reportHtmlPath = join(reportDir, `${report.reportId}.html`)
    await Promise.all([
      writeFile(reportJsonPath, JSON.stringify(report, null, 2), 'utf8'),
    ])
  } catch {
    reportJsonPath = ''
  }

  let pdf = directorResult.artifacts.pdf
  let pdfFailure: string | null = null
  if (report.citations.length > 0) {
    try {
      const artifact = await buildPdfArtifact({
        report,
        pdfPath: join(reportDir, `${report.reportId}.pdf`),
        outDir: join(reportDir, `${report.reportId}-pages`),
        render: createPdfRenderer(),
        inspect: createPdfInspector(),
      })
      if (!reportHtmlPath) {
        await mkdir(reportDir, { recursive: true })
        reportHtmlPath = join(reportDir, `${report.reportId}.html`)
      }
      await writeFile(reportHtmlPath, artifact.html, 'utf8')
      pdf = artifact.artifact
      if (!pdf.passed) pdfFailure = pdfFailureReason(pdf)
    } catch (error) {
      pdfFailure = error instanceof Error ? error.message : 'The PDF renderer failed.'
    }
  } else {
    pdfFailure = 'No sources were cited, so no PDF report can be produced.'
  }

  await sink.append({
    instanceId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    parentInstanceId: null,
    type: 'agent_completed',
    agentId: 'report_synthesizer',
    agentRole: 'synthesis',
    label: 'Synthesise the report',
    status: pdf && !pdf.passed ? 'partial' : 'completed',
    publicMessage: `Bilingual report synthesised with ${report.citations.length} citation(s)${pdf && pdf.passed ? ` and a ${pdf.pageCount}-page PDF` : ''}.`,
    parametersRedacted: { citations: report.citations.length, languageOrder: report.languageOrder, pdfPassed: pdf?.passed ?? false },
    sourceIds: directorResult.sources.map(source => source.id),
    consumption: emptyUsage(),
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    failureReason: pdf && !pdf.passed ? pdfFailure : null,
  }).catch(() => undefined)

  const proposals = analyzeClaims(report, { limit: 10 })
  let saved: SavedResearch | null = null
  const partial = directorResult.partial || pdfFailure !== null
  const gapsWithPdf = [...coverageGaps, ...(pdfFailure ? [`PDF not published: ${pdfFailure}`] : [])]

  try {
    saved = await saveResearchResult(client, task.id, task.run_id!, {
      reply: buildReply(report, pdfFailure),
      partial,
      document: { title: report.executiveBrief.headline.slice(0, 180) || 'Marketing Research Report', content: JSON.stringify(report).slice(0, 79000), type: 'research_report' },
      sources: directorResult.sources.map(source => ({
        ...source,
        excerpt: source.excerpt.slice(0, 1200),
        usage: source.usage,
      })),
      research: {
        reportId: report.reportId,
        mode: directorResult.brief.mode,
        tracks: directorResult.artifacts.tracks,
        sourceIds: directorResult.sources.map(source => source.id),
        claimIds: report.claims.map(claim => claim.id),
        citationCoverage: audit.citationCoverage,
        claimQuality: audit.claimQuality,
        coverageGaps: gapsWithPdf,
        consumption: directorResult.consumption,
        blocked: directorResult.artifacts.blocked,
        pdf,
        reportJsonPath,
        reportHtmlPath,
        partial,
        claims: report.claims.map(claim => ({
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
          claimQuality: { score: claim.claimQuality.score, coverage: claim.claimQuality.coverage },
        })),
      },
    }, partial)
  } catch (error) {
    if (error instanceof InsufficientAllowanceError) return blockedResult(brief, error.message, error)
    throw error
  }

  if (saved && proposals.length) {
    try {
      await storeResearchProposals(client, task.workspace_id, proposals.map(proposal => ({
        reportId: saved!.reportId,
        proposalKind: proposal.proposalKind,
        title: proposal.title,
        summary: proposal.summary,
        summaryAr: proposal.summaryAr,
        diff: proposal.diff as unknown as Record<string, unknown>,
        evidenceIds: proposal.evidenceIds,
        sourceUrls: proposal.sourceUrls,
        confidence: proposal.confidence,
        geography: proposal.geography,
        validFrom: proposal.validFrom,
        validUntil: proposal.validUntil,
      })))
    } catch {
      // A proposal failure never discards a completed report.
    }
  }

  return {
    result: {
      reply: buildReply(report, pdfFailure),
      partial,
      document: { title: report.executiveBrief.headline.slice(0, 180) || 'Marketing Research Report', content: JSON.stringify(report).slice(0, 79000), type: 'research_report' },
      research: {
        ...directorResult.artifacts,
        reportId: report.reportId,
        coverageGaps: gapsWithPdf,
        consumption: directorResult.consumption,
        pdf,
        reportJsonPath: `/tmp/busmora-reports/${report.reportId}.json`,
        reportHtmlPath: `/tmp/busmora-reports/${report.reportId}.html`,
        partial,
      },
    },
    report,
    saved,
    blocked: false,
    blockingReasons: [],
  }
}

function buildReply(report: ResearchReport, pdfFailure: string | null): string {
  const top = report.claims.slice(0, 3).map(claim => claim.statement).join(' ')
  const coverage = report.scope.coverage.length ? ` Coverage limits: ${report.scope.coverage.slice(0, 2).join(' ')}` : ''
  const pdf = pdfFailure ? ` The PDF report was not published: ${pdfFailure}` : ` A bilingual PDF report is ready (${report.citations.length} sources).`
  const proposals = ' Findings are pending your approval before they enter the Brain.'
  return `Your ${report.scope.mode} research report is ready. ${top}${coverage}${pdf}${proposals}`
}

function blockedResult(brief: ResearchBrief, reason: string, error: unknown) {
  const artifacts = {
    reportId: '',
    mode: brief.mode,
    tracks: brief.tracks,
    sourceIds: [],
    claimIds: [],
    citationCoverage: 0,
    claimQuality: 0,
    coverageGaps: [reason],
    budget: brief.budget,
    consumption: emptyUsage(),
    blocked: 0,
    pdf: null,
    reportJsonPath: '',
    reportHtmlPath: '',
    partial: true,
  }
  void error
  return {
    result: { reply: reason, partial: true, document: { title: 'Research blocked: no evidence retrieved', content: JSON.stringify({ reason, tracks: brief.tracks }), type: 'research_report' as const }, research: artifacts },
    report: null,
    saved: null,
    blocked: true,
    blockingReasons: [reason],
  }
}