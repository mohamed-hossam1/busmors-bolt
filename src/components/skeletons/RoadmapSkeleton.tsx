'use client'

import React from 'react'
import { SkeletonBox, SkeletonHeader } from './SkeletonPrimitives'

export default function RoadmapSkeleton() {
  return (
    <div className="workspace-page animate-fade-in" aria-label="Loading roadmap…">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <SkeletonHeader
          actions={
            <SkeletonBox className="h-9 w-28 rounded-lg" />
          }
        />

        {/* Informational Banner */}
        <div className="mb-6 rounded-xl border border-ink-100 bg-white/70 p-4 shadow-2xs">
          <div className="flex items-center gap-2 mb-2">
            <SkeletonBox className="h-4 w-4 rounded-full" />
            <SkeletonBox className="h-4 w-56 rounded-md" />
          </div>
          <SkeletonBox className="h-3.5 w-3/4 rounded-md" />
        </div>

        {/* Goal Outcome Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="card flex flex-col justify-between p-5 sm:p-6 bg-white border border-ink-100/80 rounded-2xl shadow-2xs space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <SkeletonBox className="h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <SkeletonBox className="h-5 w-32 rounded-md" />
                    <SkeletonBox className="h-3 w-20 rounded-md" />
                  </div>
                </div>
                <SkeletonBox className="h-5 w-16 rounded-full" />
              </div>

              <div className="space-y-2 pt-1">
                <SkeletonBox className="h-3.5 w-full rounded-md" />
                <SkeletonBox className="h-3.5 w-4/5 rounded-md" />
              </div>

              {/* Progress & Action */}
              <div className="pt-2 border-t border-ink-100/60 flex items-center justify-between">
                <SkeletonBox className="h-2 w-24 rounded-full" />
                <SkeletonBox className="h-8 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
