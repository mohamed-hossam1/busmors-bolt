'use client'

import React from 'react'
import { SkeletonBox, SkeletonHeader } from './SkeletonPrimitives'

export default function WorkspacePageSkeleton() {
  return (
    <div className="workspace-page animate-fade-in" aria-label="Loading page…">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <SkeletonHeader
          actions={
            <div className="flex items-center gap-2">
              <SkeletonBox className="h-9 w-24 rounded-lg" />
              <SkeletonBox className="h-9 w-28 rounded-lg" />
            </div>
          }
        />

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-ink-100 shadow-2xs">
          <div className="flex items-center gap-2">
            <SkeletonBox className="h-8 w-20 rounded-lg" />
            <SkeletonBox className="h-8 w-24 rounded-lg" />
          </div>
          <SkeletonBox className="h-8 w-48 rounded-lg" />
        </div>

        {/* Content Cards Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="card p-5 bg-white border border-ink-100 rounded-2xl shadow-2xs space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <SkeletonBox className="h-5 w-24 rounded-full" />
                <SkeletonBox className="h-4 w-12 rounded-md" />
              </div>
              <SkeletonBox className="h-4 w-full rounded-md" />
              <SkeletonBox className="h-3 w-5/6 rounded-md" />
              <div className="pt-2 border-t border-ink-100/60 flex items-center justify-between">
                <SkeletonBox className="h-3 w-20 rounded-md" />
                <SkeletonBox className="h-7 w-16 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
