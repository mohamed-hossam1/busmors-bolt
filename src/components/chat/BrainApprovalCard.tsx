'use client'

import { useEffect, useState } from 'react'
import { Check, X, AlertCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { brainError } from '../../lib/brainApi'
import { useCopy } from '../../hooks/useCopy'
import type { BrainProposalCardData } from './employeeCards'

function resolveDecision(status: unknown): 'approved' | 'rejected' | null {
  return status === 'approved' || status === 'rejected' ? status : null
}

function ValueList({ values }: { values: Record<string, unknown> | null }) {
  const entries = Object.entries(values ?? {})
  if (entries.length === 0) return <span className="text-ink-400">—</span>
  return (
    <ul className="space-y-1">
      {entries.map(([key, value]) => (
        <li key={key} className="text-xs leading-5 text-ink-700">
          <span className="font-semibold text-ink-900">{key}:</span>{' '}
          {typeof value === 'string' ? value : JSON.stringify(value)}
        </li>
      ))}
    </ul>
  )
}

const ACTION_META = {
  add: { icon: Plus, label: 'actionAdd' as const, cls: 'bg-emerald-50 text-emerald-700' },
  edit: { icon: Pencil, label: 'actionEdit' as const, cls: 'bg-amber-50 text-amber-700' },
  delete: { icon: Trash2, label: 'actionDelete' as const, cls: 'bg-red-50 text-red-700' },
}

export default function BrainApprovalCard({
  proposal,
  onResolved,
}: {
  proposal: BrainProposalCardData
  onResolved?: (proposalId: string, decision: 'approved' | 'rejected') => void
}) {
  const { t } = useCopy()
  const [busy, setBusy] = useState(false)
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const [error, setError] = useState('')
  const effectiveDecision = decision ?? resolveDecision(proposal.status)

  useEffect(() => {
    if (effectiveDecision) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('brain_proposals')
        .select('status')
        .eq('id', proposal.proposalId)
        .maybeSingle()
      if (cancelled) return
      const resolved = resolveDecision(data?.status)
      if (resolved) setDecision(resolved)
    })()
    return () => {
      cancelled = true
    }
  }, [proposal.proposalId, effectiveDecision])

  const decide = async (value: 'approved' | 'rejected') => {
    if (busy || effectiveDecision) return
    setBusy(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('decide_brain_proposal', {
        p_proposal_id: proposal.proposalId,
        p_expected_version: proposal.baseVersion,
        p_decision: value,
        p_edit: null,
      })
      if (rpcError) throw brainError(rpcError)
      setDecision(value)
      onResolved?.(proposal.proposalId, value)
    } catch (err) {
      // If the proposal was already decided elsewhere (e.g. /brain or another tab),
      // sync the persisted decision so the card locks instead of letting the user retry.
      const { data } = await supabase
        .from('brain_proposals')
        .select('status')
        .eq('id', proposal.proposalId)
        .maybeSingle()
      const resolved = resolveDecision(data?.status)
      if (resolved) {
        setDecision(resolved)
        onResolved?.(proposal.proposalId, resolved)
      } else {
        setError(err instanceof Error ? err.message : t('couldNotSaveDecision'))
      }
    } finally {
      setBusy(false)
    }
  }

  const meta = ACTION_META[proposal.action]
  const Icon = meta.icon
  const showDiff = proposal.action !== 'add'

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
            <Icon size={12} /> {t(meta.label)}
          </span>
          <span className="text-sm font-semibold text-ink-900">{proposal.title}</span>
        </div>
        {proposal.duplicate && (
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-medium text-ink-500">
            {t('duplicateProposal')}
          </span>
        )}
      </div>

      {proposal.summary && <p className="mt-2 text-xs leading-5 text-ink-700">{proposal.summary}</p>}

      {showDiff && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-white/70 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">{t('previousValue')}</p>
            <ValueList values={proposal.oldValues} />
          </div>
          <div className="rounded-lg bg-white/70 p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">{t('newValue')}</p>
            <ValueList values={proposal.newValues ?? proposal.properties} />
          </div>
        </div>
      )}

      {proposal.rationale && (
        <p className="mt-2 text-[11px] leading-5 text-ink-500">
          <span className="font-semibold text-ink-600">{t('rationaleLabel')}:</span> {proposal.rationale}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1 text-[11px] text-red-700">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {effectiveDecision ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
              effectiveDecision === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-200 text-ink-600'
            }`}
          >
            {effectiveDecision === 'approved' ? <Check size={13} /> : <X size={13} />}
            {effectiveDecision === 'approved' ? t('approvedLabel') : t('decisionRejected')}
          </span>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide('approved')}
              className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
            >
              <Check size={13} /> {t('approve')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide('rejected')}
              className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
            >
              <X size={13} /> {t('reject')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}