'use client'

import React from 'react'
import { SkeletonBox, SkeletonHeader } from './SkeletonPrimitives'

export default function SettingsSkeleton() {
  return (
    <div className="workspace-page animate-fade-in" aria-label="Loading settings…">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <SkeletonHeader />

        {/* Card 1: AI Provider & API Key */}
        <div className="card p-6 bg-white border border-ink-100 rounded-2xl shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <SkeletonBox className="h-9 w-9 rounded-xl" />
            <div className="space-y-1">
              <SkeletonBox className="h-5 w-44 rounded-md" />
              <SkeletonBox className="h-3.5 w-64 rounded-md" />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <SkeletonBox className="h-3.5 w-24 rounded-md" />
              <SkeletonBox className="h-10 w-full rounded-xl" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <SkeletonBox className="h-3.5 w-20 rounded-md" />
                <SkeletonBox className="h-10 w-full rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <SkeletonBox className="h-3.5 w-20 rounded-md" />
                <SkeletonBox className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <SkeletonBox className="h-9 w-28 rounded-lg" />
          </div>
        </div>

        {/* Card 2: Business Profile */}
        <div className="card p-6 bg-white border border-ink-100 rounded-2xl shadow-2xs space-y-4">
          <div className="flex items-center gap-3">
            <SkeletonBox className="h-9 w-9 rounded-xl" />
            <div className="space-y-1">
              <SkeletonBox className="h-5 w-36 rounded-md" />
              <SkeletonBox className="h-3.5 w-56 rounded-md" />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <SkeletonBox className="h-3.5 w-24 rounded-md" />
                <SkeletonBox className="h-10 w-full rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <SkeletonBox className="h-3.5 w-24 rounded-md" />
                <SkeletonBox className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <SkeletonBox className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
