'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCopy } from '../../hooks/useCopy'

/**
 * Live execution status indicator shown in chat while an agent turn runs.
 *
 * When `liveLabel` is provided by the SSE stream, it displays the real current
 * backend step (e.g. reading Business Brain, delegating to Director, running a
 * tool). Otherwise it falls back to cycling through localized pipeline stages.
 * Text renders in normal flow so it never collapses inside flex containers.
 */
export default function ThinkingIndicator({
  steps: stepsProp,
  liveLabel,
}: {
  steps?: string[]
  liveLabel?: string | null
}) {
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
    if (liveLabel) return
    const dwell = [1400, 1800, 1500, 2100, 1700, 2200]
    const timer = setTimeout(() => {
      setIndex((current) => (current + 1) % steps.length)
    }, dwell[index % dwell.length])
    return () => clearTimeout(timer)
  }, [index, liveLabel, steps.length])

  const activeText = liveLabel?.trim() || steps[index % steps.length]
  const progress = liveLabel ? 65 : ((index + 1) / steps.length) * 100

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex min-w-0 max-w-[88%] flex-col gap-2 rounded-2xl rounded-ss-md bg-ink-100 px-4 py-3 text-ink-700 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex shrink-0 items-center gap-1" aria-hidden>
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500 [animation-delay:0.15s]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500 [animation-delay:0.3s]" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-ink-800">
            {activeText}
          </span>
        </div>
        <span className="h-1 w-full overflow-hidden rounded-full bg-primary-100" aria-hidden>
          <span
            className="block h-full rounded-full bg-primary-400 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </span>
      </div>
    </div>
  )
}
