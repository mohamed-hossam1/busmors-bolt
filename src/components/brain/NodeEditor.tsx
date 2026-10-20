import { useState } from 'react'
import { X } from 'lucide-react'
import type { BrainCategory, BrainNode } from '../../lib/types'
import { useLang } from '../../context/LangContext'
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
  onSave: (title: string, summary: string, category: BrainCategory) => void
  onCancel: () => void
}) {
  const { t } = useLang()
  const [title, setTitle] = useState(node?.title ?? '')
  const [summary, setSummary] = useState(node?.summary ?? '')
  const [category, setCategory] = useState<BrainCategory>(node?.category ?? 'company_fact')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-3 sm:p-4" onClick={onCancel}>
      <div className="card w-full max-w-lg animate-fade-up p-4 sm:p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-base sm:text-lg">{node ? t('edit') : t('addKnowledge')}</h3>
          <button onClick={onCancel} className="text-ink-400 hover:text-ink-700 p-1">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('navBrain')}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('provenance')}</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="input-field resize-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">{t('navBrain')}</span>
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
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCancel} className="btn-secondary flex-1 sm:flex-initial">
              {t('cancel')}
            </button>
            <button onClick={() => onSave(title, summary, category)} disabled={!title.trim()} className="btn-primary flex-1 sm:flex-initial">
              {t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
