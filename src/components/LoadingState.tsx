'use client'

import { useEffect, useState } from 'react'

interface LoadingStateProps {
  label?: string
  fullScreen?: boolean
  showLogo?: boolean
}

export default function LoadingState({
  fullScreen = false,
  label = 'Loading Busmora…',
}: LoadingStateProps = {}) {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    // Hold logo in the center first, then animate smoothly to the right
    const timer = setTimeout(() => {
      setRevealed(true)
    }, 350)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      role="status"
      aria-label={label}
      className={
        fullScreen
          ? 'fixed inset-0 z-50 flex items-center justify-center bg-ink-50 p-6 select-none'
          : 'flex min-h-[320px] flex-1 items-center justify-center p-8 select-none'
      }
    >
      <div className="relative flex items-center justify-center">
        {/* Subtle glowing ambient pulse */}
        <div className="absolute -inset-6 rounded-full bg-primary-500/15 blur-2xl animate-pulse pointer-events-none" />

        <div dir="ltr" className="relative flex items-center justify-center">
          {/* Logo Mark - centered initially, then shifts smoothly as text expands */}
          <img
            src="/brand/busmora-logo.svg"
            alt="Busmora"
            width="56"
            height="44"
            className="h-12 sm:h-14 w-auto shrink-0 object-contain drop-shadow-sm transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]"
          />

          {/* Wordmark visibly slides out to the right */}
          <div
            className={`overflow-hidden whitespace-nowrap transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              revealed
                ? 'max-w-[280px] opacity-100 translate-x-0'
                : 'max-w-0 opacity-0 -translate-x-14'
            }`}
          >
            <span className="ps-3.5 text-3xl sm:text-4xl font-bold tracking-[-.055em] text-ink-900 inline-block transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]">
              busmora<span className="text-primary-500">.</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}



