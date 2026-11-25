'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, HelpCircle, Send } from 'lucide-react'
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
  const questions = card.questions
  const total = questions.length

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [notSure, setNotSure] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const current = questions[step]
  const isLast = step === total - 1

  const answered = (qid: string): boolean =>
    Boolean(notSure[qid] || (selected[qid]?.length ?? 0) > 0 || (custom[qid]?.trim() ?? ''))

  const currentAnswered = current ? answered(current.id) : false

  const toggle = (qid: string, option: string, type: 'single' | 'multiple') => {
    setNotSure((prev) => ({ ...prev, [qid]: false }))
    setSelected((prev) => {
      const list = prev[qid] ?? []
      if (type === 'single') return { ...prev, [qid]: [option] }
      return {
        ...prev,
        [qid]: list.includes(option) ? list.filter((o) => o !== option) : [...list, option],
      }
    })
  }

  const goNext = () => {
    if (!currentAnswered || isLast) return
    setDirection('forward')
    setStep((s) => Math.min(total - 1, s + 1))
  }

  const goBack = () => {
    if (step === 0) return
    setDirection('back')
    setStep((s) => Math.max(0, s - 1))
  }

  // Build the combined answer text for every question (answered or not).
  const buildLines = (): string => {
    const lines = questions.map((q) => {
      const parts: string[] = []
      if (notSure[q.id]) parts.push(t('notSure'))
      else {
        if (selected[q.id]?.length) parts.push(selected[q.id].join('، '))
        const extra = custom[q.id]?.trim()
        if (extra) parts.push(extra)
      }
      return `- ${q.question}: ${parts.join(' | ') || '—'}`
    })
    return lines.join('\n')
  }

  const submit = () => {
    if (submitted) return
    const lines = buildLines()
    setSubmitted(true)
    onSubmit(lines)
  }

  const progress = useMemo(
    () => t('clarificationProgress', { current: step + 1, total }),
    [t, step, total],
  )

  return (
    <div className="mt-2 rounded-xl border border-primary-200 bg-primary-50/40 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <HelpCircle size={15} className="text-primary-600" /> {t('clarificationTitle')}
        </div>
        {total > 1 && (
          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-500">
            {progress}
          </span>
        )}
      </div>

      {total > 1 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary-100">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-500 ease-out"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      )}

      {current && (
        <div
          key={`${step}-${direction}`}
          className={`mt-3 ${direction === 'forward' ? 'clarify-step-forward' : 'clarify-step-back'}`}
        >
          <p className="text-xs font-medium leading-5 text-ink-800">{current.question}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {current.options.map((option) => {
              const active = selected[current.id]?.includes(option) ?? false
              return (
                <button
                  key={option}
                  type="button"
                  disabled={submitted || disabled}
                  onClick={() => toggle(current.id, option, current.type)}
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
            {current.notSure && (
              <button
                type="button"
                disabled={submitted || disabled}
                onClick={() => setNotSure((prev) => ({ ...prev, [current.id]: !prev[current.id] }))}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  notSure[current.id]
                    ? 'border-ink-400 bg-ink-500 text-white'
                    : 'border-dashed border-ink-300 bg-white text-ink-500 hover:border-ink-400'
                } ${submitted ? 'opacity-60' : ''}`}
              >
                {t('notSure')}
              </button>
            )}
          </div>
          {current.allowCustom && (
            <input
              value={custom[current.id] ?? ''}
              disabled={submitted || disabled}
              onChange={(e) => {
                setNotSure((prev) => ({ ...prev, [current.id]: false }))
                setCustom((prev) => ({ ...prev, [current.id]: e.target.value }))
              }}
              placeholder={t('customAnswerPlaceholder')}
              className="input-field mt-2 w-full text-xs"
            />
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        {step > 0 && !submitted ? (
          <button
            type="button"
            disabled={disabled}
            onClick={goBack}
            className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs"
          >
            <ArrowLeft size={13} className="rtl:rotate-180" /> {t('clarificationBack')}
          </button>
        ) : (
          <span />
        )}

        {submitted ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <Check size={13} /> {t('answerSent')}
          </span>
        ) : isLast ? (
          <button
            type="button"
            disabled={submitted || disabled}
            onClick={submit}
            className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            <Send size={13} /> {t('submitAnswers')}
          </button>
        ) : (
          <button
            type="button"
            disabled={!currentAnswered || disabled}
            onClick={goNext}
            className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {t('clarificationNext')} <ArrowRight size={13} className="rtl:rotate-180" />
          </button>
        )}
      </div>
    </div>
  )
}