'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCopy } from '../../hooks/useCopy'

/**
 * Dynamic "thinking" indicator shown inside the chat while a turn runs.
 *
 * Rather than a static three-dots bubble, it walks through the real execution
 * pipeline (understand → review business data → plan → delegate to the Director
 * → prepare deliverables → finalize), cross-fading each live status label with
 * animated dots and an advancing progress bar. Each step lingers for a varied
 * duration so the indicator feels alive rather than metronomic.
 *
 * `steps` may be supplied by a future streaming integration to drive the labels
 * from real backend events; it defaults to the localized pipeline sequence.
 */
export default function ThinkingIndicator({ steps: stepsProp }: { steps?: string[] }) {
  const { t } = useCopy()
  const defaultSteps = useMemo(
    () => [
      t('thinkingStep1'),
      t('thinkingStep2'),
      t('thinkingStep3'),
      t('thinkingStep4'),
      t('thinkingStep5'),
      t('thinkingStep6'),
    ],
    [t],
  )
  const steps = stepsProp && stepsProp.length > 0 ? stepsProp : defaultSteps
  const [index, setIndex] = useState(0)

  useEffect(() => {
    // Varied per-step dwell time (ms); loops while the turn is still running.
    const dwell = [1400, 1800, 1500, 2100, 1700, 2200]
    let timer: ReturnType<typeof setTimeout>
    const advance = () => {
      timer = setTimeout(() => {
        setIndex((current) => (current + 1) % steps.length)
        advance()
      }, dwell[index % dwell.length])
    }
    advance()
    return () => clearTimeout(timer)
  }, [index, steps.length])

  const progress = ((index + 1) / steps.length) * 100

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex min-w-0 max-w-[88%] flex-col gap-2 rounded-2xl rounded-ss-md bg-ink-100 px-4 py-3 text-ink-700 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex shrink-0 items-center gap-1" aria-hidden>
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500 [animation-delay:0.15s]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500 [animation-delay:0.3s]" />
          </span>
          <span className="relative block h-5 min-w-0 flex-1 overflow-hidden text-sm font-medium">
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
        <span className="h-1 w-full overflow-hidden rounded-full bg-primary-100" aria-hidden>
          <span
            className="block h-full rounded-full bg-primary-400 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </span>
      </div>
    </div>
  )
}