'use client'

import { useDialog } from '../../hooks/useDialog'
import { useState } from 'react'
import { X } from 'lucide-react'
import type { BrainCategory, BrainNode } from '../../lib/types'
import { useCopy } from '../../hooks/useCopy'
import type { TranslationKey } from '../../lib/i18n'

const CATEGORIES: BrainCategory[] = [
  'company_profile',
  'offering',
  'audience',
  'brand_rule',
  'positioning',
  'strategic_goal',
  'channel',
  'competitor',
  'company_fact',
]

export default function NodeEditor({
  node,
  onSave,
  onCancel,
}: {
  node: BrainNode | null
  onSave: (title: string, summary: string, category: BrainCategory, properties: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useCopy()
  const [title, setTitle] = useState(node?.title ?? '')
  const [summary, setSummary] = useState(node?.summary ?? '')
  const [properties,setProperties] = useState<Record<string,unknown>>(node?.properties ?? {})
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const close = ()=>{if(!busy)onCancel()}
  useDialog(true, close)
  const [category, setCategory] = useState<BrainCategory>(node?.category ?? 'company_fact')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={node ? "Edit knowledge" : "Add knowledge"} className="card modal-panel w-full max-w-lg animate-fade-up p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-base sm:text-lg">{node ? t('edit') : t('addKnowledge')}</h3>
          <button onClick={close} disabled={busy} aria-label="Close knowledge editor" className="text-ink-400 hover:text-ink-700 p-1">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Title</span>
            <input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} className="input-field" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Summary</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              maxLength={6000}
              className="input-field resize-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BrainCategory)}
              className="input-field"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`cat_${c}` as TranslationKey)}
                </option>
              ))}
            </select>
          </label>
          {category==='offering' && <fieldset className="space-y-3 rounded-xl border border-ink-200 p-3"><legend className="px-1 text-sm font-medium">Pricing details</legend>
            <label className="block text-sm">Pricing model<select className="input-field mt-2" value={String(properties.pricingModel??'unknown')} onChange={e=>setProperties({...properties,pricingModel:e.target.value,amount:null,currency:null})}><option value="unknown">Unknown / not set</option><option value="fixed">Fixed price</option><option value="starting_from">Starting from</option><option value="quote_required">Quote required</option></select></label>
            {['fixed','starting_from'].includes(String(properties.pricingModel)) && <div className="grid grid-cols-2 gap-3"><label className="text-sm">Amount (optional)<input className="input-field mt-2" inputMode="decimal" value={String(properties.amount??'')} onChange={e=>setProperties({...properties,amount:e.target.value||null})}/></label><label className="text-sm">Currency<input className="input-field mt-2" maxLength={3} value={String(properties.currency??'')} onChange={e=>setProperties({...properties,currency:e.target.value.toUpperCase()||null})}/></label></div>}
          </fieldset>}
          {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={close} disabled={busy} className="btn-secondary flex-1 sm:flex-initial">
              {t('cancel')}
            </button>
            <button onClick={async () => {
              setError('')
              if(properties.amount != null && (!/^\d+(\.\d{1,2})?$/.test(String(properties.amount)) || !/^[A-Z]{3}$/.test(String(properties.currency??'')))){setError('Enter a valid amount and a three-letter currency, or leave the amount unknown.');return}
              setBusy(true)
              try{await onSave(title,summary,category,properties)}catch(error){setError(error instanceof Error?error.message:'Could not save this change.')}finally{setBusy(false)}
            }} disabled={busy||!title.trim()} className="btn-primary flex-1 sm:flex-initial">
              {busy?t('saving'):t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
