import type { EvidenceObservation, SourceRecord } from '../contracts'
import type { WorkerClaim } from '../director/director'
import type { ResolvedEntity } from '../references/entity-resolution'
import { EPISTEMIC_RULES, evaluateClaim } from '../references/rubric'
import { checkGeographyGeneralization } from '../references/geography'

export type AuditSeverity = 'block' | 'warn'

export interface AuditIssue {
  claimId: string
  rule: string
  severity: AuditSeverity
  reason: string
}

export interface AuditedClaim {
  claimId: string
  score: number
  coverage: 'full' | 'partial' | 'none'
  verdict: 'pass' | 'block' | 'warn'
  reasons: string[]
}

export interface AuditResult {
  passed: boolean
  claimQuality: number
  citationCoverage: number
  issues: AuditIssue[]
  claims: AuditedClaim[]
  conflicts: string[]
  notes: string[]
}

const REVIEWS_OVERREACH = /\b(?:everyone|all customers|everybody|no one|nobody|always|never)\b/i

/**
 * Ticket 14: Evidence Auditor / Quality Gate.
 * Blocks indefensible claims instead of finding a more attractive answer.
 */
export function auditClaims(input: {
  claims: WorkerClaim[]
  sources: SourceRecord[]
  observations: EvidenceObservation[]
  entities: ResolvedEntity[]
  today?: Date
}): AuditResult {
  const issues: AuditIssue[] = []
  const conflicts: string[] = []
  const notes: string[] = []
  const sourceById = new Map(input.sources.map(source => [source.id, source]))
  const observationById = new Map(input.observations.map(item => [item.id, item]))
  const claims = input.claims
  const consequential = claims.filter(claim => claim.kind !== 'method')
  const cited = consequential.filter(claim => claim.evidenceIds.length > 0)
  const citationCoverage = consequential.length === 0 ? 1 : cited.length / consequential.length

  for (const claim of claims) {
    const evidence = claim.evidenceIds.map(id => observationById.get(id)).filter((item): item is EvidenceObservation => !!item)
    const citedSources = evidence.map(item => sourceById.get(item.sourceId)).filter((source): source is SourceRecord => !!source)
    const directness = evidence.some(item => item.directness === 'direct')
    const ephemeral = citedSources.some(source => source.storagePolicy === 'ephemeral')
    const blocked = citedSources.some(source => source.availability !== 'retrieved')

    if (claim.kind !== 'method' && claim.evidenceIds.length === 0) {
      issues.push({ claimId: claim.id, rule: 'citation_coverage', severity: 'block', reason: 'Consequential claim without any citation. Every consequential claim needs an opened source.' })
    }
    if (claim.claimQuality.score < 0.5 && claim.kind !== 'method' && evidence.length > 0) {
      issues.push({ claimId: claim.id, rule: 'claim_quality', severity: 'block', reason: `Claim quality ${claim.claimQuality.score} is below the 0.5 defensibility threshold.` })
    }
    if (claim.kind === 'voice_of_customer' || evidence.some(item => item.kind === 'quote')) {
      const quotes = evidence.filter(item => item.kind === 'quote')
      if (quotes.length === 0) {
        issues.push({ claimId: claim.id, rule: 'quote_existence', severity: 'block', reason: 'A Voice-of-Customer claim has no stored quote.' })
      } else {
        const missingTranslation = quotes.some(quote => quote.quoteLanguage === 'ar-EG' && !quote.translation)
        if (missingTranslation) issues.push({ claimId: claim.id, rule: 'quote_translation', severity: 'warn', reason: 'Arabic quote(s) have no separate translation; the original is preserved and the translation is missing.' })
        const missingQuote = quotes.filter(quote => !citedSources.some(source => source.excerpt.includes(quote.quote.slice(0, 40))))
        if (missingQuote.length) issues.push({ claimId: claim.id, rule: 'quote_existence', severity: 'warn', reason: 'A quote could not be matched to the stored source excerpt.' })
      }
    }
    if (claim.kind === 'voice_of_customer' && REVIEWS_OVERREACH.test(claim.statement)) {
      issues.push({ claimId: claim.id, rule: 'review_overreach', severity: 'warn', reason: 'The claim generalises from reviews to everyone/always. Reviews are a biased sample, not a census.' })
    }
    const geography = checkGeographyGeneralization(claim.geography, citedSources.map(source => source.geography ?? '').join(', ') || null)
    if (!geography.ok && geography.reason) {
      issues.push({ claimId: claim.id, rule: 'cairo_not_egypt', severity: 'block', reason: geography.reason })
    }
    if (claim.kind === 'pricing') {
      const priceEvidence = evidence.filter(item => item.kind === 'price')
      if (priceEvidence.length === 0) {
        issues.push({ claimId: claim.id, rule: 'price_comparability', severity: 'block', reason: 'A price claim has no price observation attached.' })
      } else if (priceEvidence.some(item => /(?:free|مجاني|0\s*egp|zero)/i.test(item.quote))) {
        issues.push({ claimId: claim.id, rule: 'missing_not_zero', severity: 'block', reason: 'A free/zero price is claimed without a source. Missing is not zero.' })
      } else {
        const vatMixed = priceEvidence.some(item => /(?:including vat|شامل الضريبة)/i.test(item.quote)) && priceEvidence.some(item => !/(?:including vat|شامل الضريبة)/i.test(item.quote))
        if (vatMixed) issues.push({ claimId: claim.id, rule: 'price_comparability', severity: 'warn', reason: 'Mixed VAT treatment in one comparison; use landed prices with the basis shown.' })
      }
    }
    if (claim.conflicts.length > 0) {
      conflicts.push(...claim.conflicts.map(reason => `${claim.id}: ${reason}`))
      issues.push({ claimId: claim.id, rule: 'unresolved_conflict', severity: 'warn', reason: 'Unresolved conflict kept visible: both figures and sources are reported.' })
    }
    if (ephemeral) issues.push({ claimId: claim.id, rule: 'storage_policy', severity: 'warn', reason: 'A cited source used an ephemeral storage policy; the excerpt may not be retained.' })
    if (blocked) issues.push({ claimId: claim.id, rule: 'blocked_source', severity: 'warn', reason: 'A cited source is marked blocked/unavailable; it cannot support the claim on its own.' })
    if (!directness && evidence.length > 0) issues.push({ claimId: claim.id, rule: 'directness', severity: 'warn', reason: 'All evidence is indirect or contextual rather than direct.' })
    if (claim.evidenceIds.length > 0 && citedSources.length === 0 && claim.kind !== 'method') {
      issues.push({ claimId: claim.id, rule: 'source_presence', severity: 'block', reason: 'The cited source ids do not resolve to stored sources.' })
    }
  }

  const aliasGroups = new Map<string, Set<string>>()
  for (const entity of input.entities) {
    const key = `${entity.level}:${entity.parentKey ?? entity.key}`
    const names = aliasGroups.get(key) ?? new Set<string>()
    names.add(entity.name)
    for (const alias of entity.aliases) names.add(alias)
    aliasGroups.set(key, names)
  }
  const aliasCount = [...aliasGroups.values()].filter(names => names.size > 1).length
  if (aliasCount > 0) notes.push(`${aliasCount} entity group(s) carry aliases; deduplication used the resolved key.`)

  const audited: AuditedClaim[] = claims.map(claim => {
    const claimIssues = issues.filter(issue => issue.claimId === claim.id)
    const blocking = claimIssues.some(issue => issue.severity === 'block')
    return {
      claimId: claim.id,
      score: claim.claimQuality.score,
      coverage: claim.claimQuality.coverage,
      verdict: blocking ? 'block' : claimIssues.length ? 'warn' : 'pass',
      reasons: claimIssues.length ? claimIssues.map(issue => issue.reason) : ['Claim is cited, direct and above the quality threshold.'],
    }
  })

  const claimQuality = claims.length ? claims.reduce((sum, claim) => sum + claim.claimQuality.score, 0) / claims.length : 1
  const blocking = issues.filter(issue => issue.severity === 'block')
  notes.push(EPISTEMIC_RULES.missingIsNotZero)
  notes.push(EPISTEMIC_RULES.absenceIsNotEvidence)
  notes.push(EPISTEMIC_RULES.unresolvedConflictsStayVisible)

  return {
    passed: blocking.length === 0,
    claimQuality: Math.round(claimQuality * 1000) / 1000,
    citationCoverage: Math.round(citationCoverage * 1000) / 1000,
    issues,
    claims: audited,
    conflicts,
    notes,
  }
}

/** Re-score a claim from its own evidence set, used by synthesis before publishing. */
export function rescoreClaim(claim: WorkerClaim, sources: SourceRecord[], observations: EvidenceObservation[], today?: Date): number {
  return evaluateClaim({ statement: claim.statement, geography: claim.geography }, claim.evidenceIds.map(id => observations.find(item => item.id === id)).filter((item): item is EvidenceObservation => !!item), sources, { today }).score
}

export interface AuditSummary {
  passed: boolean
  claimQuality: number
  citationCoverage: number
  blockingRules: string[]
  warningRules: string[]
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