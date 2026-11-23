import type { BrainCategory } from '../../../lib/types'
import type { Confidence } from '../contracts'
import type { ResearchReport } from '../synthesis/report'

export type ResearchProposalKind = 'market_fact' | 'competitor' | 'audience_insight' | 'positioning_claim' | 'price_observation' | 'opportunity_hypothesis'

export interface ResearchProposal {
  id: string
  reportId: string
  proposalKind: ResearchProposalKind
  title: string
  summary: string
  summaryAr: string | null
  diff: { category: BrainCategory; title: string; summary: string; properties: Record<string, unknown> }
  evidenceIds: string[]
  sourceUrls: string[]
  confidence: Confidence
  geography: string | null
  validFrom: string | null
  validUntil: string | null
  status: 'pending' | 'approved' | 'rejected'
}

const KIND_MAP: Readonly<Record<string, { kind: ResearchProposalKind; category: BrainCategory }>> = Object.freeze({
  market_frame: { kind: 'market_fact', category: 'company_fact' },
  competitor_landscape: { kind: 'competitor', category: 'competitor' },
  pricing: { kind: 'price_observation', category: 'offering' },
  voice_of_customer: { kind: 'audience_insight', category: 'audience' },
  positioning_frame: { kind: 'positioning_claim', category: 'positioning' },
  perceptual_map: { kind: 'positioning_claim', category: 'positioning' },
  white_space: { kind: 'opportunity_hypothesis', category: 'strategic_goal' },
  benchmark: { kind: 'competitor', category: 'competitor' },
  opportunity: { kind: 'opportunity_hypothesis', category: 'strategic_goal' },
})

export interface AnalyzeOptions {
  existingTitles?: string[]
  limit?: number
  maxProposalsPerKind?: number
}

/**
 * Ticket 17: the Brain Proposal Analyzer reads only structured claims (never the PDF)
 * and emits typed, bilingual proposals that stay pending until owner approval.
 */
export function analyzeClaims(report: ResearchReport, options: AnalyzeOptions = {}): ResearchProposal[] {
  const limit = options.limit ?? 12
  const maxPerKind = options.maxProposalsPerKind ?? 3
  const existing = new Set((options.existingTitles ?? []).map(title => title.trim().toLowerCase()))
  const counts = new Map<ResearchProposalKind, number>()
  const proposals: ResearchProposal[] = []

  for (const claim of report.claims) {
    if (proposals.length >= limit) break
    const mapped = KIND_MAP[claim.kind]
    if (!mapped) continue
    const evidence = claim.evidenceIds.length
    const citationKeys = report.claimLedger.find(entry => entry.claimId === claim.id)?.citationKeys ?? []
    const urls = citationKeys.map(key => report.citations.find(citation => citation.key === key)?.url).filter((url): url is string => !!url)
    if (urls.length === 0) continue
    const title = claim.statement.length > 140 ? `${claim.statement.slice(0, 137)}…` : claim.statement
    if (existing.has(title.toLowerCase())) continue
    const used = counts.get(mapped.kind) ?? 0
    if (used >= maxPerKind) continue
    counts.set(mapped.kind, used + 1)
    proposals.push({
      id: `proposal:${claim.id}`,
      reportId: report.reportId,
      proposalKind: mapped.kind,
      title,
      summary: claim.statement,
      summaryAr: claim.statementAr,
      diff: {
        category: mapped.category,
        title,
        summary: claim.statement,
        properties: {
          proposalKind: mapped.kind,
          reportId: report.reportId,
          evidenceIds: claim.evidenceIds,
          sourceUrls: urls,
          citationKeys,
          confidence: claim.confidence,
          geography: claim.geography,
          claimQuality: claim.claimQuality,
          evidenceCount: evidence,
        },
      },
      evidenceIds: claim.evidenceIds,
      sourceUrls: urls,
      confidence: claim.confidence,
      geography: claim.geography,
      validFrom: claim.validFrom,
      validUntil: claim.validUntil,
      status: 'pending' as const,
    })
  }
  return proposals
}