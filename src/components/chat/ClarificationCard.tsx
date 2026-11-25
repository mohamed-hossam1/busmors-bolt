'use client'

import { useMemo, useState } from 'react'
import { HelpCircle, Send } from 'lucide-react'
import { useCopy } from '../../hooks/useCopy'
import type { ClarificationCard } from './clarification-types'

export default function ClarificationCardView({
  card,
  onSubmit,
  disabled,
}: {
  card: ClarificationCard
  onSubmit: (answerText: string) => void
  disabled?: boolean
}) {
  const { t } = useCopy()
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [notSure, setNotSure] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const toggle = (qid: string, option: string, type: 'single' | 'multiple') => {
    setNotSure((prev) => ({ ...prev, [qid]: false }))
    setSelected((prev) => {
      const current = prev[qid] ?? []
      if (type === 'single') return { ...prev, [qid]: [option] }
      return {
        ...prev,
        [qid]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
      }
    })
  }

  const hasAnyAnswer = useMemo(
    () =>
      card.questions.some(
        (q) => notSure[q.id] || (selected[q.id]?.length ?? 0) > 0 || (custom[q.id]?.trim() ?? ''),
      ),
    [card.questions, notSure, selected, custom],
  )

  const submit = () => {
    if (!hasAnyAnswer || submitted) return
    const lines = card.questions.map((q) => {
      const parts: string[] = []
      if (notSure[q.id]) parts.push(t('notSure'))
      else {
        if (selected[q.id]?.length) parts.push(selected[q.id].join('، '))
        const extra = custom[q.id]?.trim()
        if (extra) parts.push(extra)
      }
      return `- ${q.question}: ${parts.join(' | ') || '—'}`
    })
    setSubmitted(true)
    onSubmit(lines.join('\n'))
  }

  return (
    <div className="mt-2 rounded-xl border border-primary-200 bg-primary-50/40 p-3.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <HelpCircle size={15} className="text-primary-600" /> {t('clarificationTitle')}
      </div>
      <div className="mt-3 space-y-4">
        {card.questions.map((q) => (
          <div key={q.id}>
            <p className="text-xs font-medium leading-5 text-ink-800">{q.question}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {q.options.map((option) => {
                const active = selected[q.id]?.includes(option) ?? false
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={submitted || disabled}
                    onClick={() => toggle(q.id, option, q.type)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      active
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-ink-200 bg-white text-ink-700 hover:border-primary-300'
                    } ${submitted ? 'opacity-60' : ''}`}
                  >
                    {option}
                  </button>
                )
              })}
              {q.notSure && (
                <button
                  type="button"
                  disabled={submitted || disabled}
                  onClick={() =>
                    setNotSure((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    notSure[q.id]
                      ? 'border-ink-400 bg-ink-500 text-white'
                      : 'border-dashed border-ink-300 bg-white text-ink-500 hover:border-ink-400'
                  } ${submitted ? 'opacity-60' : ''}`}
                >
                  {t('notSure')}
                </button>
              )}
            </div>
            {q.allowCustom && (
              <input
                value={custom[q.id] ?? ''}
                disabled={submitted || disabled}
                onChange={(e) => {
                  setNotSure((prev) => ({ ...prev, [q.id]: false }))
                  setCustom((prev) => ({ ...prev, [q.id]: e.target.value }))
                }}
                placeholder={t('customAnswerPlaceholder')}
                className="input-field mt-2 w-full text-xs"
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={!hasAnyAnswer || submitted || disabled}
          onClick={submit}
          className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          <Send size={13} /> {submitted ? t('answerSent') : t('submitAnswers')}
        </button>
      </div>
    </div>
  )
}