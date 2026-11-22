import type { ClaimQuality, Confidence, EvidenceObservation, SourceRecord } from '../contracts'

/** Evidence / confidence rubric: hypothesis → supported → validated → strong. */
export const CONFIDENCE_ORDER: readonly Confidence[] = Object.freeze(['hypothesis', 'supported', 'validated', 'strong'])

export const CONFIDENCE_RULES: Readonly<Record<Confidence, string>> = Object.freeze({
  hypothesis: 'A plausible reading with a single weak or indirect source. Not yet safe to act on.',
  supported: 'At least one direct, recent, Egyptian source corroborates the claim.',
  validated: 'Two or more independent direct sources agree, with consistent definitions and units.',
  strong: 'Multiple independent official or first-party sources agree, are recent, and cover the stated geography.',
})

export interface QualityInput {
  authority: number
  directness: number
  relevance: number
  recencyDays: number
  corroborationCount: number
}

/** Recency decays linearly to zero after 24 months. */
export function recencyScore(days: number): number {
  if (!Number.isFinite(days) || days < 0) return 0
  if (days <= 90) return 1
  if (days >= 730) return 0.1
  return Math.max(0.1, 1 - (days - 90) / 640)
}

const clamp = (value: number) => Math.max(0, Math.min(1, Math.round(value * 100) / 100))

/** Claim-quality weighting. Missing evidence scores zero, never an assumed average. */
export function scoreClaim(input: QualityInput): ClaimQuality {
  const recency = recencyScore(input.recencyDays)
  const corroboration = clamp(Math.min(1, input.corroborationCount / 3))
  const score = clamp(input.authority * 0.3 + input.directness * 0.25 + input.relevance * 0.15 + recency * 0.15 + corroboration * 0.15)
  const reasons: string[] = []
  if (input.authority < 0.6) reasons.push('Authority below official/first-party threshold.')
  if (input.directness < 0.5) reasons.push('Evidence is indirect or summarised, not the source itself.')
  if (input.relevance < 0.5) reasons.push('Weak Egyptian relevance for the stated scope.')
  if (recency < 0.5) reasons.push('Evidence is older than twelve months.')
  if (input.corroborationCount < 2) reasons.push('No independent corroboration.')
  if (!reasons.length) reasons.push('Authority, directness, Egyptian relevance, recency and corroboration all hold.')
  const coverage: ClaimQuality['coverage'] = input.corroborationCount >= 2 && input.directness >= 0.8 ? 'full' : input.corroborationCount >= 1 || input.directness >= 0.5 ? 'partial' : 'none'
  return {
    authority: clamp(input.authority),
    directness: clamp(input.directness),
    relevance: clamp(input.relevance),
    recency,
    corroboration,
    score,
    coverage,
    reasons,
  }
}

export function confidenceFromScore(score: number, corroborationCount: number, authority: number): Confidence {
  if (score >= 0.82 && corroborationCount >= 2 && authority >= 0.85) return 'strong'
  if (score >= 0.68 && corroborationCount >= 2) return 'validated'
  if (score >= 0.5) return 'supported'
  return 'hypothesis'
}

const DIRECTNESS: Readonly<Record<EvidenceObservation['directness'], number>> = Object.freeze({ direct: 1, derived: 0.6, context: 0.3 })

/** Score one claim from its evidence set. Absence of evidence stays visible. */
export function evaluateClaim(
  claim: { statement: string; geography: string | null },
  evidence: EvidenceObservation[],
  sources: SourceRecord[],
  options: { today?: Date; scopeRelevance?: number } = {},
): ClaimQuality {
  const today = options.today ?? new Date()
  const byId = new Map(sources.map(source => [source.id, source]))
  const relevant = evidence.filter(item => item.storagePolicy !== 'ephemeral' && byId.has(item.sourceId))
  const corroborating = new Set(relevant.map(item => item.sourceId)).size
  if (relevant.length === 0) {
    return { ...scoreClaim({ authority: 0, directness: 0, relevance: 0, recencyDays: 0, corroborationCount: 0 }), reasons: ['No evidence supports this claim. Missing is not zero: this is unverified, not false.'] }
  }
  const authority = Math.max(...relevant.map(item => byId.get(item.sourceId)?.authorityScore ?? 0.5))
  const directness = Math.max(...relevant.map(item => DIRECTNESS[item.directness]))
  const relevance = options.scopeRelevance ?? (claim.geography ? 0.8 : 0.5)
  const recencyDays = Math.max(...relevant.map(item => {
    const captured = Date.parse(byId.get(item.sourceId)?.capturedAt ?? item.observedAt)
    return Number.isFinite(captured) ? Math.max(0, Math.round((today.getTime() - captured) / 86400000)) : 9999
  }))
  return scoreClaim({ authority, directness, relevance, recencyDays, corroborationCount: corroborating })
}

/** Weighting used by the benchmark analyst when it scores opportunities. */
export const CLAIM_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  official: 1,
  first_party: 0.85,
  community: 0.5,
  press: 0.55,
  discovery: 0.15,
})

export function claimWeight(source: Pick<SourceRecord, 'availability' | 'provider' | 'authorityScore'>): number {
  if (source.availability !== 'retrieved') return 0
  const base = CLAIM_WEIGHTS[source.provider] ?? 0.5
  return Math.round(base * source.authorityScore * 100) / 100
}

/** Missing ≠ zero and absence of evidence ≠ evidence of absence. */
export const EPISTEMIC_RULES = Object.freeze({
  missingIsNotZero: 'A missing observation is recorded as unknown, never as zero or as a negative fact.',
  absenceIsNotEvidence: 'No evidence found is reported as "no evidence found", not as "does not exist".',
  unresolvedConflictsStayVisible: 'Conflicting figures are shown side by side with their sources and dates.',
})