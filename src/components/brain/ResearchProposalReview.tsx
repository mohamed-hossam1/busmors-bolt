'use client'

import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { brainError } from '../../lib/brainApi'
import { useCopy } from '../../hooks/useCopy'

export interface ResearchProposalRow {
  id: string
  report_id: string
  proposal_kind: string
  title: string
  summary: string
  summary_ar: string | null
  diff: Record<string, unknown> & { category?: string }
  evidence_ids: string[]
  source_urls: string[]
  confidence: 'hypothesis' | 'supported' | 'validated' | 'strong'
  geography: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

const KIND_KEYS: Record<string, string> = {
  market_fact: 'kindMarketFact',
  competitor: 'kindCompetitor',
  audience_insight: 'kindAudienceInsight',
  positioning_claim: 'kindPositioningClaim',
  price_observation: 'kindPriceObservation',
  opportunity_hypothesis: 'kindOpportunityHypothesis',
}

const CONFIDENCE_STYLES: Record<string, string> = {
  hypothesis: 'bg-slate-100 text-slate-700',
  supported: 'bg-amber-100 text-amber-800',
  validated: 'bg-teal-100 text-teal-800',
  strong: 'bg-emerald-100 text-emerald-800',
}

export default function ResearchProposalReview({ proposals, onChanged }: { proposals: ResearchProposalRow[]; onChanged: () => Promise<void> }) {
  const { t } = useCopy()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [showRejected, setShowRejected] = useState(false)

  const pending = useMemo(() => proposals.filter(proposal => proposal.status === 'pending'), [proposals])
  const rejected = useMemo(() => proposals.filter(proposal => proposal.status === 'rejected'), [proposals])
  const allSelected = pending.length > 0 && selected.length === pending.length

  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  const decide = async (ids: string[], decision: 'approved' | 'rejected') => {
    if (!ids.length) return
    setBusy(ids.length === 1 ? ids[0] : 'selected')
    setError('')
    try {
      for (const id of ids) {
        const { error } = await supabase.rpc('decide_research_proposal', { p_proposal_id: id, p_decision: decision })
        if (error) throw brainError(error)
      }
      setSelected([])
      await onChanged()
    } catch (error) {
      setError(error instanceof Error ? error.message : t('couldNotSaveDecision'))
    } finally {
      setBusy(null)
    }
  }

  if (!proposals.length) return null

  return (
    <section className="mb-6 rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{t('researchFindings')} <span className="badge ms-2">{pending.length}</span></h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">{t('researchFindingsDesc')}</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : pending.map(proposal => proposal.id))} />
          {t('selectAll')}
        </label>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {pending.map(proposal => (
          <article key={proposal.id} className="flex h-full flex-col justify-between rounded-xl border border-ink-100 bg-white p-4">
            <div className="flex-1">
              <div className="flex items-start gap-2">
                <input type="checkbox" aria-label={t('selectProposal', { title: proposal.title })} checked={selected.includes(proposal.id)} onChange={() => toggle(proposal.id)} className="mt-1" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-snug text-ink-900">{proposal.title}</h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-700">{KIND_KEYS[proposal.proposal_kind] ? t(KIND_KEYS[proposal.proposal_kind] as never) : proposal.proposal_kind}</span>
                    <span className={`rounded-full px-2 py-0.5 font-medium ${CONFIDENCE_STYLES[proposal.confidence] ?? 'bg-ink-100 text-ink-700'}`}>{t(`confidence_${proposal.confidence}` as never)}</span>
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-700">{t('evidenceCount', { count: proposal.evidence_ids.length })}</span>
                    {proposal.geography && <span className="rounded-full bg-ink-100 px-2 py-0.5 font-medium text-ink-700">{proposal.geography}</span>}
                  </div>
                  {proposal.summary_ar && <p dir="rtl" className="mt-2 text-xs leading-6 text-ink-600">{proposal.summary_ar}</p>}
                  {proposal.source_urls.length > 0 && (
                    <details className="mt-2 text-[11px] text-ink-500">
                      <summary className="cursor-pointer select-none">{t('sourceLinks')}</summary>
                      <ul className="mt-1 space-y-0.5 break-all">
                        {proposal.source_urls.slice(0, 5).map(url => (
                          <li key={url}><a className="text-primary-700 underline" href={url} target="_blank" rel="noreferrer">{url}</a></li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-100 pt-3">
              <button disabled={!!busy} className="btn-primary text-xs" onClick={() => void decide([proposal.id], 'approved')}>{t('approve')}</button>
              <button disabled={!!busy} className="btn-secondary text-xs" onClick={() => void decide([proposal.id], 'rejected')}>{t('reject')}</button>
            </div>
          </article>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={!!busy || selected.length === 0} className="btn-primary text-xs" onClick={() => void decide(selected, 'approved')}>{t('approveSelected', { count: selected.length })}</button>
          <button disabled={!!busy || selected.length === 0} className="btn-secondary text-xs" onClick={() => void decide(selected, 'rejected')}>{t('rejectSelected', { count: selected.length })}</button>
        </div>
      )}

      {rejected.length > 0 && (
        <div className="mt-4">
          <button className="text-xs font-medium text-ink-600 underline" onClick={() => setShowRejected(value => !value)}>
            {showRejected ? t('hide') : t('show')} {t('rejectedFindingsCount', { count: rejected.length })}
          </button>
          {showRejected && (
            <ul className="mt-2 space-y-1 text-xs text-ink-500">
              {rejected.slice(0, 10).map(proposal => <li key={proposal.id}>{t('rejectedLabel', { title: proposal.title })}</li>)}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}