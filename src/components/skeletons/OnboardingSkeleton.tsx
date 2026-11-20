'use client'

import React from 'react'
import { SkeletonBox, SkeletonCircle } from './SkeletonPrimitives'

export default function OnboardingSkeleton() {
  return (
    <div className="grid min-h-[100dvh] bg-ink-50 lg:grid-cols-2 animate-fade-in" aria-label="Loading onboarding…">
      {/* Left Column */}
      <div className="flex min-w-0 flex-col px-6 py-7 sm:px-12 lg:px-16">
        {/* Brand Logo Placeholder */}
        <div className="flex items-center gap-2">
          <SkeletonCircle size={32} />
          <SkeletonBox className="h-6 w-28 rounded-md" />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-start py-12 sm:py-16">
          {/* Eyebrow */}
          <div className="mb-6 flex items-center gap-2">
            <SkeletonCircle size={16} />
            <SkeletonBox className="h-4 w-40 rounded-md" />
          </div>

          {/* Heading & Subtitle */}
          <SkeletonBox className="h-9 w-64 rounded-xl mb-3" />
          <SkeletonBox className="h-4 w-80 rounded-md mb-8" />

          {/* Choice Cards */}
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-2xl border border-ink-200/80 bg-white p-4 shadow-2xs"
              >
                <SkeletonBox className="h-11 w-11 rounded-xl shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBox className="h-4 w-24 rounded-md" />
                  <SkeletonBox className="h-3 w-48 rounded-md" />
                </div>
                <SkeletonBox className="h-4 w-4 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>

        <SkeletonBox className="h-3 w-36 rounded-md" />
      </div>

      {/* Right Column (Dark Cosmic Panel on Desktop) */}
      <aside className="auth-brand-panel relative mx-6 my-12 mt-20 hidden w-full min-w-0 max-w-2xl flex-col justify-between overflow-hidden rounded-[32px] border border-white/10 bg-cosmic-card p-10 text-white lg:flex lg:w-[calc(100%_-_3rem)] xl:p-14">
        <div className="space-y-6">
          <SkeletonBox className="h-8 w-44 rounded-full bg-white/10" />
          <div className="space-y-3 pt-4">
            <SkeletonBox className="h-12 w-72 rounded-2xl bg-white/10" />
            <SkeletonBox className="h-12 w-60 rounded-2xl bg-white/10" />
          </div>
          <div className="space-y-2 pt-2">
            <SkeletonBox className="h-4 w-80 rounded-md bg-white/10" />
            <SkeletonBox className="h-4 w-64 rounded-md bg-white/10" />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-5">
          <SkeletonBox className="h-4 w-48 rounded-md bg-white/10" />
          <SkeletonBox className="h-5 w-5 rounded-md bg-white/10" />
        </div>
      </aside>
    </div>
  )
}
