'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import type { FormField } from '../../lib/types'
import { useI18n } from '../../context/I18nContext'

interface QuestionWizardProps {
  fields: FormField[]
  onSubmit: (values: Record<string, string | string[]>) => Promise<void>
  disabled?: boolean
}

export function QuestionWizard({ fields, onSubmit, disabled = false }: QuestionWizardProps) {
  const { locale, dir } = useI18n()
  const isAr = locale === 'ar'

  const [currentIndex, setCurrentIndex] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [animating, setAnimating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!fields || fields.length === 0) return null

  const currentField = fields[currentIndex]
  const total = fields.length
  const isLast = currentIndex === total - 1
  const currentValue = values[currentField.name] ?? ''

  const handleSelectOption = (option: string) => {
    if (disabled || submitting) return
    setValues(prev => ({ ...prev, [currentField.name]: option }))
  }

  const handleCustomTextChange = (text: string) => {
    if (disabled || submitting) return
    setValues(prev => ({ ...prev, [currentField.name]: text }))
  }

  const handleNext = () => {
    if (currentIndex < total - 1) {
      setAnimating(true)
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1)
        setAnimating(false)
      }, 200)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setAnimating(true)
      setTimeout(() => {
        setCurrentIndex(prev => prev - 1)
        setAnimating(false)
      }, 200)
    }
  }

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await onSubmit(values)
    } catch (err) {
      setError(err instanceof Error ? err.message : isAr ? 'فشل حفظ الإجابة' : 'Failed to save answer')
      setSubmitting(false)
    }
  }

  const canProceed = Boolean(currentValue && currentValue.trim())

  return (
    <div className="mt-3 w-full rounded-2xl border border-primary-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm transition-all" dir={dir}>
      {/* Step Header & Progress */}
      <div className="mb-3 flex items-center justify-between border-b border-ink-100 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
            {currentIndex + 1}
          </span>
          <span className="text-xs font-semibold text-ink-600">
            {isAr ? `السؤال ${currentIndex + 1} من ${total}` : `Question ${currentIndex + 1} of ${total}`}
          </span>
        </div>
        {/* Progress Dots */}
        <div className="flex items-center gap-1.5">
          {fields.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex
                  ? 'w-6 bg-primary-600'
                  : idx < currentIndex
                    ? 'w-2 bg-emerald-500'
                    : 'w-2 bg-ink-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Animated Question Body */}
      <div
        className={`transition-all duration-200 ease-out ${
          animating
            ? 'opacity-0 translate-y-2 scale-[0.98]'
            : 'opacity-100 translate-y-0 scale-100'
        }`}
      >
        <h4 className="text-sm font-bold text-ink-900 leading-snug">
          {currentField.label}
        </h4>

        {/* Options Chips */}
        {!!currentField.options?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {currentField.options.map(option => {
              const isSelected = currentValue === option
              return (
                <button
                  type="button"
                  key={option}
                  disabled={disabled || submitting}
                  onClick={() => handleSelectOption(option)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 text-primary-900 shadow-sm ring-1 ring-primary-400'
                      : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50'
                  }`}
                >
                  {isSelected && <Check size={12} className="text-primary-600" />}
                  <span>{option}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Custom Text Option */}
        <div className="mt-3">
          <label className="block text-[11px] font-medium text-ink-500">
            {isAr ? 'أو اكتب إجابة مخصصة:' : 'Or type a custom answer:'}
          </label>
          <input
            type="text"
            disabled={disabled || submitting}
            value={currentValue}
            maxLength={1000}
            onChange={e => handleCustomTextChange(e.target.value)}
            placeholder={isAr ? 'اكتب تفاصيل إضافية هنا...' : 'Type additional details here...'}
            className="input-field mt-1.5 w-full text-xs"
          />
        </div>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

      {/* Navigation Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
        {currentIndex > 0 ? (
          <button
            type="button"
            disabled={disabled || submitting}
            onClick={handlePrev}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-600 hover:text-ink-900 disabled:opacity-50"
          >
            {dir === 'rtl' ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
            <span>{isAr ? 'السابق' : 'Back'}</span>
          </button>
        ) : <div />}

        {!isLast ? (
          <button
            type="button"
            disabled={disabled || submitting || !canProceed}
            onClick={handleNext}
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-40"
          >
            <span>{isAr ? 'التالي' : 'Next'}</span>
            {dir === 'rtl' ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || submitting || !canProceed}
            onClick={handleFinalSubmit}
            className="btn-primary inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs disabled:opacity-40"
          >
            <Sparkles size={13} />
            <span>{submitting ? (isAr ? 'جاري التنفيذ...' : 'Starting...') : (isAr ? 'تأكيد والبدء' : 'Confirm & Start')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
