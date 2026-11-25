'use client'

import { useEffect, useState } from 'react'
import { useCopy } from '../../hooks/useCopy'

/**
 * Distinctive "thinking" indicator shown inside the chat while a turn runs.
 * Cycles through subtle step labels with a smooth cross-fade and animated dots.
 */
export default function ThinkingIndicator() {
  const { t } = useCopy()
  const steps = [t('thinkingStep1'), t('thinkingStep2'), t('thinkingStep3')]
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIndex((current) => (current + 1) % steps.length), 2200)
    return () => clearInterval(id)
  }, [steps.length])

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-2xl rounded-ss-md bg-ink-100 px-4 py-3 text-ink-700 shadow-sm">
        <span className="flex items-center gap-1" aria-hidden>
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500 [animation-delay:0.15s]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500 [animation-delay:0.3s]" />
        </span>
        <span className="relative block h-5 overflow-hidden text-sm font-medium">
          {steps.map((label, i) => (
            <span
              key={i}
              className={`absolute inset-0 whitespace-nowrap transition-all duration-500 ${
                i === index ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
              }`}
            >
              {label}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}