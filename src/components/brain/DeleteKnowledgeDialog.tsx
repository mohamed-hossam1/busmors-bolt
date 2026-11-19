'use client'

import { useState } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
import { useDialog } from '../../hooks/useDialog'
import { useCopy } from '../../hooks/useCopy'
import type { BrainNode } from '../../lib/types'

type Props = {
  node: BrainNode
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (skipConfirmation: boolean) => void
}

export default function DeleteKnowledgeDialog({ node, busy, error, onCancel, onConfirm }: Props) {
  const { t } = useCopy()
  const [skipConfirmation, setSkipConfirmation] = useState(false)
  useDialog(true, () => { if (!busy) onCancel() })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm animate-fade-in"
      onClick={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-knowledge-title" aria-describedby="delete-knowledge-description"
        aria-busy={busy} className="card modal-panel w-full max-w-md animate-fade-up rounded-2xl p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><Trash2 size={21} /></span>
          <button type="button" aria-label={t('cancel')} onClick={onCancel} disabled={busy}
            className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 disabled:opacity-50"><X size={18} /></button>
        </div>
        <h2 id="delete-knowledge-title" className="mt-4 text-lg font-semibold text-ink-900">Delete knowledge card?</h2>
        <p id="delete-knowledge-description" className="mt-2 text-sm leading-6 text-ink-600">
          Delete <span className="font-medium text-ink-900" dir="auto">“{node.title}”</span> and its connections? This cannot be undone.
        </p>
        <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/60 px-3 py-3 text-sm text-ink-700">
          <input type="checkbox" checked={skipConfirmation} onChange={(event) => setSkipConfirmation(event.target.checked)} disabled={busy}
            className="h-4 w-4 shrink-0 accent-primary-600" />
          Don't ask me again
        </label>
        {error && <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={onCancel} disabled={busy}>{t('cancel')}</button>
          <button type="button" className="btn-danger px-4 py-2 text-sm" onClick={() => onConfirm(skipConfirmation)} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}{busy ? 'Deleting…' : t('delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
