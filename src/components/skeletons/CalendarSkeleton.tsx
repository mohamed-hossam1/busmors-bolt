'use client'

import React from 'react'
import { SkeletonBox, SkeletonHeader } from './SkeletonPrimitives'

export default function CalendarSkeleton() {
  return (
    <div className="workspace-page animate-fade-in" aria-label="Loading posting schedule…">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <SkeletonHeader
          actions={
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-9 w-28 rounded-lg" />
              <SkeletonBox className="h-9 w-32 rounded-lg" />
            </div>
          }
        />

        {/* 3 Stat Cards */}
        <div className="mb-7 grid grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="stat-card p-4 rounded-xl border border-ink-100 bg-white shadow-2xs space-y-2">
              <SkeletonBox className="h-3 w-16 rounded-md" />
              <SkeletonBox className="h-7 w-12 rounded-md" />
            </div>
          ))}
        </div>

        {/* Post Draft Cards */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="card p-5 sm:p-6 bg-white border border-ink-100 rounded-2xl shadow-2xs space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <SkeletonBox className="h-9 w-9 rounded-xl" />
                  <div className="space-y-1">
                    <SkeletonBox className="h-4 w-28 rounded-md" />
                    <SkeletonBox className="h-3 w-20 rounded-md" />
                  </div>
                </div>
                <SkeletonBox className="h-6 w-20 rounded-full" />
              </div>

              <div className="space-y-2 py-1">
                <SkeletonBox className="h-4 w-full rounded-md" />
                <SkeletonBox className="h-4 w-5/6 rounded-md" />
                <SkeletonBox className="h-4 w-3/4 rounded-md" />
              </div>

              <div className="pt-3 border-t border-ink-100/60 flex items-center justify-between">
                <SkeletonBox className="h-4 w-36 rounded-md" />
                <div className="flex items-center gap-2">
                  <SkeletonBox className="h-8 w-20 rounded-lg" />
                  <SkeletonBox className="h-8 w-24 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
