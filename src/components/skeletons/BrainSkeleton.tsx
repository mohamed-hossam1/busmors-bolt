'use client'

import React from 'react'
import { SkeletonBox, SkeletonHeader } from './SkeletonPrimitives'

export default function BrainSkeleton() {
  return (
    <div className="workspace-page animate-fade-in" aria-label="Loading knowledge brain…">
      <div className="mx-auto max-w-5xl">
        {/* Header with Buttons */}
        <header className="brain-page-header">
          <div className="flex items-center gap-3">
            <SkeletonBox className="h-11 w-11 rounded-2xl" />
            <div className="space-y-2">
              <SkeletonBox className="h-6 w-40 rounded-md" />
              <SkeletonBox className="h-4 w-64 rounded-md" />
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <SkeletonBox className="h-9 w-28 rounded-lg" />
            <SkeletonBox className="h-9 w-28 rounded-lg" />
            <SkeletonBox className="h-9 w-32 rounded-lg" />
            <SkeletonBox className="h-9 w-32 rounded-lg" />
          </div>
        </header>

        {/* Filter and Search Bar */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-ink-200/80 shadow-2xs">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-8 w-20 rounded-lg" />
            <SkeletonBox className="h-8 w-24 rounded-lg" />
            <SkeletonBox className="h-8 w-24 rounded-lg" />
          </div>
          <SkeletonBox className="h-8 w-full md:w-56 rounded-lg" />
        </div>

        {/* Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="card flex flex-col justify-between p-5 bg-white border border-ink-100 rounded-2xl shadow-2xs space-y-4 min-h-[220px]"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <SkeletonBox className="h-5 w-24 rounded-full" />
                  <SkeletonBox className="h-4 w-12 rounded-md" />
                </div>
                <div className="space-y-1.5 mb-3">
                  <SkeletonBox className="h-4 w-full rounded-md" />
                  <SkeletonBox className="h-4 w-4/5 rounded-md" />
                </div>
                <div className="space-y-1.5">
                  <SkeletonBox className="h-3 w-full rounded-md" />
                  <SkeletonBox className="h-3 w-2/3 rounded-md" />
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div className="mt-auto pt-3 border-t border-ink-100/60 flex items-center gap-2">
                <SkeletonBox className="h-8 flex-1 rounded-lg" />
                <SkeletonBox className="h-8 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
