'use client'

import React from 'react'
import { SkeletonBox, SkeletonHeader } from './SkeletonPrimitives'

export default function DeliverablesSkeleton() {
  return (
    <div className="workspace-page animate-fade-in" aria-label="Loading deliverables…">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <SkeletonHeader
          actions={
            <SkeletonBox className="h-9 w-32 rounded-lg" />
          }
        />

        {/* Search & Filter Bar */}
        <div className="mb-6 space-y-3">
          <SkeletonBox className="h-10 w-full rounded-xl" />
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <SkeletonBox className="h-8 w-20 rounded-full" />
            <SkeletonBox className="h-8 w-24 rounded-full" />
            <SkeletonBox className="h-8 w-24 rounded-full" />
            <SkeletonBox className="h-8 w-28 rounded-full" />
          </div>
        </div>

        {/* Count Label */}
        <SkeletonBox className="h-4 w-32 rounded-md mb-4" />

        {/* Deliverable Cards Grid */}
        <div className="grid gap-5 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="card flex flex-col justify-between p-5 sm:p-6 bg-white border border-ink-100 rounded-2xl shadow-2xs space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <SkeletonBox className="h-11 w-11 rounded-xl" />
                  <SkeletonBox className="h-5 w-24 rounded-full" />
                </div>
                <div className="space-y-1.5 mb-3">
                  <SkeletonBox className="h-5 w-3/4 rounded-md" />
                  <SkeletonBox className="h-5 w-1/2 rounded-md" />
                </div>
                <div className="space-y-2">
                  <SkeletonBox className="h-3.5 w-full rounded-md" />
                  <SkeletonBox className="h-3.5 w-5/6 rounded-md" />
                  <SkeletonBox className="h-3.5 w-2/3 rounded-md" />
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-ink-100/60 flex items-center justify-between">
                <SkeletonBox className="h-3.5 w-28 rounded-md" />
                <SkeletonBox className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
